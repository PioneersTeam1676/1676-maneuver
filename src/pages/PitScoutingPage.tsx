import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { getForm } from "@/lib/formBuilderApi";
import { ACTIVE_FORM_UPDATED_EVENT, getActiveFormId, syncActiveFormConfig } from "@/lib/activeForm";
import { savePitScoutingEntry } from "@/lib/pitScoutingUtils";
import type { FormDefinition, FormField } from "@/types/formBuilder";

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "field";

const isEmptyValue = (value: unknown, field: FormField) => {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  if (field.type === "checkbox") return value !== true;
  return false;
};

const getInitialValue = (field: FormField) => {
  if (field.type === "checkbox") return false;
  if (field.type === "multi_select") return [] as string[];
  return "";
};

const buildInitialValues = (form: FormDefinition): Record<string, unknown> => {
  const nextValues: Record<string, unknown> = {};
  form.schema.sections.forEach((section) => {
    section.fields.forEach((field) => {
      nextValues[field.id] = getInitialValue(field);
    });
  });
  return nextValues;
};

type BaseErrors = {
  teamNumber?: string;
  eventName?: string;
  scoutName?: string;
};

const PitScoutingPage = () => {
  const [activeFormId, setActiveFormIdState] = useState(() => getActiveFormId("pit"));
  const [form, setForm] = useState<FormDefinition | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [baseErrors, setBaseErrors] = useState<BaseErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [teamNumber, setTeamNumber] = useState("");
  const [eventName, setEventName] = useState("");
  const [scoutName, setScoutName] = useState("");

  useEffect(() => {
    const savedScoutName = localStorage.getItem("currentScout") || localStorage.getItem("scoutName") || "";
    const savedEventName = localStorage.getItem("eventName") || "";
    setScoutName(savedScoutName);
    setEventName(savedEventName);
  }, []);

  useEffect(() => {
    let cancelled = false;
    syncActiveFormConfig()
      .then((config) => {
        if (!cancelled) {
          setActiveFormIdState(config.pit || "");
        }
      })
      .catch((error) => {
        console.warn("Failed to sync active pit form config", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleActiveUpdate = () => {
      setActiveFormIdState(getActiveFormId("pit"));
    };
    window.addEventListener(ACTIVE_FORM_UPDATED_EVENT, handleActiveUpdate);
    return () => {
      window.removeEventListener(ACTIVE_FORM_UPDATED_EVENT, handleActiveUpdate);
    };
  }, []);

  useEffect(() => {
    if (!activeFormId) {
      setForm(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    getForm(activeFormId)
      .then((data) => {
        setForm(data);
        setValues(buildInitialValues(data));
        setErrors({});
      })
      .catch((error) => {
        console.error("Failed to load pit scouting form", error);
        toast.error("Could not load the active pit scouting form.");
        setForm(null);
      })
      .finally(() => setLoading(false));
  }, [activeFormId]);

  const flattenedFields = useMemo(() => {
    if (!form) return [];
    return form.schema.sections.flatMap((section) => section.fields);
  }, [form]);

  const handleValueChange = (fieldId: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
    setErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const handleToggleOption = (fieldId: string, option: string) => {
    setValues((prev) => {
      const current = Array.isArray(prev[fieldId]) ? (prev[fieldId] as string[]) : [];
      const exists = current.includes(option);
      const next = exists ? current.filter((item) => item !== option) : [...current, option];
      return { ...prev, [fieldId]: next };
    });
  };

  const buildSubmission = (currentForm: FormDefinition) => {
    const usedKeys = new Set<string>();
    const responseData: Record<string, unknown> = {};

    currentForm.schema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        const baseLabel = field.label || field.id;
        const customKey = typeof field.key === "string" ? normalizeKey(field.key) : "";
        const baseKey = customKey || `field_${normalizeKey(baseLabel)}`;
        let key = baseKey;
        if (usedKeys.has(key)) {
          const fallbackBase = customKey || `field_${normalizeKey(baseLabel)}`;
          key = `${fallbackBase}_${field.id.slice(0, 6)}`;
        }
        usedKeys.add(key);

        let value = values[field.id];
        if (field.type === "number" || field.type === "rating" || field.type === "slider") {
          if (value !== "" && value !== undefined && value !== null) {
            const num = Number(value);
            value = Number.isNaN(num) ? value : num;
          }
        }
        responseData[key] = value;
      });
    });

    return {
      teamNumber: teamNumber.trim(),
      eventName: eventName.trim(),
      scoutName: scoutName.trim(),
      formId: currentForm.id,
      formName: currentForm.name,
      formYear: currentForm.year,
      formType: currentForm.type,
      formVersion: currentForm.updatedAt || currentForm.createdAt || null,
      recordedAt: new Date().toISOString(),
      ...responseData,
    };
  };

  const handleSubmit = async () => {
    if (!form) return;

    const nextBaseErrors: BaseErrors = {};
    if (!teamNumber.trim()) nextBaseErrors.teamNumber = "Required";
    if (!eventName.trim()) nextBaseErrors.eventName = "Required";
    if (!scoutName.trim()) nextBaseErrors.scoutName = "Required";

    if (Object.keys(nextBaseErrors).length > 0) {
      setBaseErrors(nextBaseErrors);
      toast.error("Please fill out the required pit scouting info.");
      return;
    }

    const nextErrors: Record<string, string> = {};
    flattenedFields.forEach((field) => {
      if (field.required && isEmptyValue(values[field.id], field)) {
        nextErrors[field.id] = "Required";
      }
    });

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error("Please fill out all required fields.");
      return;
    }

    setSaving(true);
    try {
      const submission = buildSubmission(form);
      await savePitScoutingEntry(submission);
      toast.success("Pit scouting entry saved.");
      setValues(buildInitialValues(form));
      setErrors({});
      setBaseErrors({});
      setTeamNumber("");
    } catch (error) {
      console.error("Failed to save pit scouting entry", error);
      toast.error("Failed to save pit scouting entry.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto max-w-4xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>Loading pit scouting form…</CardTitle>
            <CardDescription>Preparing the active pit scouting form.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="container mx-auto max-w-4xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>No active pit scouting form</CardTitle>
            <CardDescription>
              Set an active pit scouting form in Form Maker, then refresh this page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{form.name}</h1>
          <p className="text-muted-foreground">Pit scouting</p>
        </div>
      </div>

      <Card className="border-muted/60">
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl">Pit Scouting Info</CardTitle>
          <CardDescription>Enter the team, event, and scout info before filling out the form.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>
                Team Number *
              </Label>
              <Input
                value={teamNumber}
                onChange={(event) => {
                  setTeamNumber(event.target.value);
                  if (baseErrors.teamNumber) {
                    setBaseErrors((prev) => ({ ...prev, teamNumber: undefined }));
                  }
                }}
                placeholder="e.g. 1676"
              />
              {baseErrors.teamNumber ? (
                <p className="text-xs text-destructive">{baseErrors.teamNumber}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>
                Event Name *
              </Label>
              <Input
                value={eventName}
                onChange={(event) => {
                  setEventName(event.target.value);
                  if (baseErrors.eventName) {
                    setBaseErrors((prev) => ({ ...prev, eventName: undefined }));
                  }
                }}
                placeholder="e.g. fmaevent"
              />
              {baseErrors.eventName ? (
                <p className="text-xs text-destructive">{baseErrors.eventName}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label>
                Scout Name *
              </Label>
              <Input
                value={scoutName}
                onChange={(event) => {
                  setScoutName(event.target.value);
                  if (baseErrors.scoutName) {
                    setBaseErrors((prev) => ({ ...prev, scoutName: undefined }));
                  }
                }}
                placeholder="Your name"
              />
              {baseErrors.scoutName ? (
                <p className="text-xs text-destructive">{baseErrors.scoutName}</p>
              ) : null}
            </div>
          </div>
        </CardContent>
      </Card>

      {form.schema.sections.map((section) => (
        <Card key={section.id} className="border-muted/60">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl">{section.title}</CardTitle>
            {section.description ? (
              <CardDescription>{section.description}</CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="space-y-4">
            {section.fields.map((field) => {
              const fieldValue = values[field.id];
              const isRequired = Boolean(field.required);
              const fieldError = errors[field.id];

              if (field.type === "long_text") {
                return (
                  <div key={field.id} className="space-y-2">
                    <Label>
                      {field.label} {isRequired ? "*" : ""}
                    </Label>
                    <Textarea
                      value={String(fieldValue ?? "")}
                      onChange={(event) => handleValueChange(field.id, event.target.value)}
                      placeholder={field.placeholder || ""}
                    />
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                );
              }

              if (field.type === "select" || field.type === "radio") {
                return (
                  <div key={field.id} className="space-y-2">
                    <Label>
                      {field.label} {isRequired ? "*" : ""}
                    </Label>
                    <Select
                      value={String(fieldValue ?? "")}
                      onValueChange={(value) => handleValueChange(field.id, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={field.placeholder || "Select an option"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(field.options || []).map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                );
              }

              if (field.type === "multi_select") {
                const selected = Array.isArray(fieldValue) ? (fieldValue as string[]) : [];
                return (
                  <div key={field.id} className="space-y-2">
                    <Label>
                      {field.label} {isRequired ? "*" : ""}
                    </Label>
                    <div className="space-y-2">
                      {(field.options || []).map((option) => (
                        <label key={option} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={selected.includes(option)}
                            onCheckedChange={() => handleToggleOption(field.id, option)}
                          />
                          <span>{option}</span>
                        </label>
                      ))}
                    </div>
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                );
              }

              if (field.type === "checkbox") {
                return (
                  <div key={field.id} className="space-y-2">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={Boolean(fieldValue)}
                        onCheckedChange={(value) => handleValueChange(field.id, Boolean(value))}
                      />
                      <span>
                        {field.label} {isRequired ? "*" : ""}
                      </span>
                    </label>
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                );
              }

              if (field.type === "slider") {
                const min = field.min ?? 0;
                const max = field.max ?? 5;
                const step = field.step ?? 1;
                const numericValue = Number(fieldValue || min);
                return (
                  <div key={field.id} className="space-y-2">
                    <Label>
                      {field.label} {isRequired ? "*" : ""}
                    </Label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={numericValue}
                        onChange={(event) => handleValueChange(field.id, event.target.value)}
                        className="w-full"
                      />
                      <span className="text-sm font-medium w-10 text-right">{numericValue}</span>
                    </div>
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                );
              }

              if (field.type === "rating") {
                const min = field.min ?? 1;
                const max = field.max ?? 5;
                const options = Array.from({ length: max - min + 1 }, (_, idx) => String(min + idx));
                return (
                  <div key={field.id} className="space-y-2">
                    <Label>
                      {field.label} {isRequired ? "*" : ""}
                    </Label>
                    <Select
                      value={String(fieldValue ?? "")}
                      onValueChange={(value) => handleValueChange(field.id, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={field.placeholder || "Select rating"} />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                );
              }

              const inputType =
                field.type === "number"
                  ? "number"
                  : field.type === "date"
                    ? "date"
                    : field.type === "time"
                      ? "time"
                      : "text";

              return (
                <div key={field.id} className="space-y-2">
                  <Label>
                    {field.label} {isRequired ? "*" : ""}
                  </Label>
                  <Input
                    type={inputType}
                    value={String(fieldValue ?? "")}
                    onChange={(event) => handleValueChange(field.id, event.target.value)}
                    placeholder={field.placeholder || ""}
                  />
                  {field.helpText ? (
                    <p className="text-xs text-muted-foreground">{field.helpText}</p>
                  ) : null}
                  {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end gap-3">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Saving…" : "Submit"}
        </Button>
      </div>
    </div>
  );
};

export default PitScoutingPage;
