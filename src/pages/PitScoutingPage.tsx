import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CircleHelp } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SpecialMultipleChoice } from "@/components/ui/special-multiple-choice";

import hardcodedPitFormData from "@/data/hardcodedPitForm.json";
import { EVENT_UPDATED_EVENT } from "@/lib/eventSettingsClient";
import { savePitScoutingEntry } from "@/lib/pitScoutingUtils";
import { cn } from "@/lib/utils";
import { coercePages, flattenFields, getPageFields, normalizeUiConfig } from "@/lib/formSchema";
import type { FormDefinition, FormField, FormFloatingImage } from "@/types/formBuilder";

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
  if ((field.type === "radio" || field.type === "radio_cards") && field.multiSelect) return [] as string[];
  if (field.type === "image") return "";
  return "";
};

const normalizeExclusiveGroup = (value?: string) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const FieldLabel = ({ field, isRequired }: { field: FormField; isRequired: boolean }) => {
  const description = typeof field.helpText === "string" ? field.helpText.trim() : "";
  return (
    <div className="flex items-center gap-1.5">
      <Label className="flex-1">
        {field.label} {isRequired ? "*" : ""}
      </Label>
      {description ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`${field.label} description`}
            >
              <CircleHelp className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {description}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  );
};

const toFiniteNumber = (value: unknown, fallback: number) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const normalizeFloatingImage = (image: FormFloatingImage): FormFloatingImage => ({
  ...image,
  x: toFiniteNumber(image.x, 50),
  y: toFiniteNumber(image.y, 50),
  width: toFiniteNumber(image.width, 200),
  opacity: toFiniteNumber(image.opacity, 100),
  rotation: toFiniteNumber(image.rotation, 0),
  zIndex: toFiniteNumber(image.zIndex, 0),
  showOnMobile: image.showOnMobile !== false,
});

const buildInitialValues = (form: FormDefinition): Record<string, unknown> => {
  const nextValues: Record<string, unknown> = {};
  flattenFields(form.schema).forEach((field) => {
    nextValues[field.id] = getInitialValue(field);
  });
  return nextValues;
};

type BaseErrors = {
  teamNumber?: string;
};

const readScoutName = () =>
  localStorage.getItem("currentScout") || localStorage.getItem("scoutName") || "";

const readEventName = () => localStorage.getItem("eventName") || "";

const HARDCODED_PIT_FORM = (() => {
  const raw = hardcodedPitFormData as unknown as FormDefinition;
  const pages = coercePages(raw.schema);
  return {
    ...raw,
    schema: {
      ...raw.schema,
      pages,
    },
  };
})();

const PitScoutingPage = () => {
  const form = HARDCODED_PIT_FORM;
  const [values, setValues] = useState<Record<string, unknown>>(() => buildInitialValues(form));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [baseErrors, setBaseErrors] = useState<BaseErrors>({});
  const [saving, setSaving] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

  const [teamNumber, setTeamNumber] = useState("");
  const [eventName, setEventName] = useState("");
  const [scoutName, setScoutName] = useState("");

  useEffect(() => {
    const updateFromStorage = () => {
      setScoutName(readScoutName());
      setEventName(readEventName());
    };

    updateFromStorage();

    const handleStorage = (event: StorageEvent) => {
      if (
        event.key === "currentScout" ||
        event.key === "scoutName" ||
        event.key === "eventName" ||
        event.key === null
      ) {
        updateFromStorage();
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(EVENT_UPDATED_EVENT, updateFromStorage);
    window.addEventListener("scoutChanged", updateFromStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(EVENT_UPDATED_EVENT, updateFromStorage);
      window.removeEventListener("scoutChanged", updateFromStorage);
    };
  }, []);

  const pages = useMemo(() => coercePages(form.schema), [form]);
  const uiConfig = useMemo(() => normalizeUiConfig(form.schema.ui), [form]);
  const layoutMode = uiConfig.layout || "auto";
  const isPaged = layoutMode === "paged" || (layoutMode === "auto" && pages.length > 1);
  const displayPages = useMemo(() => {
    if (isPaged) return pages;
    const allSections = pages.flatMap((page) => page.sections);
    const allFloatingImages = pages.flatMap((page) => page.floatingImages || []);
    return [
      {
        id: "page_all",
        title: "",
        description: "",
        floatingImages: allFloatingImages,
        sections: allSections,
      },
    ];
  }, [isPaged, pages]);
  const displayPageCount = displayPages.length;
  const currentPage = displayPages[Math.min(pageIndex, displayPageCount - 1)] || displayPages[0];
  const currentPageFields = useMemo(() => getPageFields(currentPage), [currentPage]);
  const allFields = useMemo(() => flattenFields(form.schema), [form]);
  const fieldMap = useMemo(
    () => Object.fromEntries(allFields.map((field) => [field.id, field])),
    [allFields]
  );
  const activeExclusiveByGroup = useMemo(() => {
    const next: Record<string, string> = {};
    allFields.forEach((field) => {
      const group = normalizeExclusiveGroup(field.exclusiveGroup);
      if (!group || next[group]) return;
      if (!isEmptyValue(values[field.id], field)) {
        next[group] = field.id;
      }
    });
    return next;
  }, [allFields, values]);
  const floatingImages = useMemo(
    () =>
      (currentPage?.floatingImages || [])
        .filter((image) => typeof image.src === "string" && image.src.trim().length > 0)
        .map(normalizeFloatingImage),
    [currentPage]
  );
  const showBaseInfo = !isPaged || pageIndex === 0;

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, displayPageCount - 1));
  }, [displayPageCount]);

  const handleValueChange = (fieldId: string, value: unknown) => {
    setValues((prev) => {
      const next = { ...prev, [fieldId]: value };
      const changedField = allFields.find((field) => field.id === fieldId);
      const group = normalizeExclusiveGroup(changedField?.exclusiveGroup);
      if (!changedField || !group || isEmptyValue(value, changedField)) {
        return next;
      }
      allFields.forEach((field) => {
        if (field.id === fieldId) return;
        if (normalizeExclusiveGroup(field.exclusiveGroup) !== group) return;
        next[field.id] = getInitialValue(field);
      });
      return next;
    });
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
      const nextValues: Record<string, unknown> = { ...prev, [fieldId]: next };
      const changedField = allFields.find((field) => field.id === fieldId);
      const group = normalizeExclusiveGroup(changedField?.exclusiveGroup);
      if (!changedField || !group || isEmptyValue(next, changedField)) {
        return nextValues;
      }
      allFields.forEach((field) => {
        if (field.id === fieldId) return;
        if (normalizeExclusiveGroup(field.exclusiveGroup) !== group) return;
        nextValues[field.id] = getInitialValue(field);
      });
      return nextValues;
    });
    setErrors((prev) => {
      if (!prev[fieldId]) return prev;
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const buildSubmission = (currentForm: FormDefinition, eventKey: string, scout: string) => {
    const usedKeys = new Set<string>();
    const responseData: Record<string, unknown> = {};

    flattenFields(currentForm.schema).forEach((field) => {
      const baseLabel = field.label || field.id;
      const rawCustomKey = typeof field.key === "string" ? field.key.trim() : "";
      const customKey = rawCustomKey ? normalizeKey(rawCustomKey) : "";
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

    return {
      teamNumber: teamNumber.trim(),
      eventName: eventKey,
      scoutName: scout,
      formId: currentForm.id,
      formName: currentForm.name,
      formYear: currentForm.year,
      formType: currentForm.type,
      formVersion: currentForm.updatedAt || currentForm.createdAt || null,
      recordedAt: new Date().toISOString(),
      ...responseData,
    };
  };

  const handleImageUpload = async (fieldId: string, file?: File | null) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image file is too large. Please choose a file under 10MB.");
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(file);
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Could not get canvas context"));
            return;
          }

          const maxWidth = 1200;
          const newWidth = Math.min(maxWidth, img.width);
          const newHeight = (img.height * newWidth) / img.width;
          canvas.width = newWidth;
          canvas.height = newHeight;
          ctx.drawImage(img, 0, 0, newWidth, newHeight);
          URL.revokeObjectURL(objectUrl);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Failed to load image"));
        };
        img.src = objectUrl;
      });

      handleValueChange(fieldId, dataUrl);
    } catch (error) {
      console.error("Failed to process image upload", error);
      toast.error("Failed to upload image.");
    }
  };

  const handleNextPage = () => {
    if (!isPaged) return;
    const nextErrors: Record<string, string> = {};
    currentPageFields.forEach((field) => {
      if (field.required && isEmptyValue(values[field.id], field)) {
        nextErrors[field.id] = "Required";
      }
    });
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast.error("Please fill out all required fields.");
      return;
    }
    setPageIndex((prev) => Math.min(prev + 1, displayPageCount - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBackPage = () => {
    if (!isPaged) return;
    setPageIndex((prev) => Math.max(prev - 1, 0));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    const nextBaseErrors: BaseErrors = {};
    if (!teamNumber.trim()) nextBaseErrors.teamNumber = "Required";

    if (Object.keys(nextBaseErrors).length > 0) {
      setBaseErrors(nextBaseErrors);
      toast.error("Please fill out the required pit scouting info.");
      return;
    }

    const currentEvent = readEventName().trim();
    const currentScout = readScoutName().trim();

    if (!currentEvent) {
      toast.error("Set the current event before submitting pit scouting.");
      return;
    }

    if (!currentScout) {
      toast.error("Set your scout name before submitting pit scouting.");
      return;
    }

    const nextErrors: Record<string, string> = {};
    allFields.forEach((field) => {
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
      const submission = buildSubmission(form, currentEvent, currentScout);
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

  return (
    <div
      className={cn(
        "container mx-auto max-w-5xl animate-in fade-in-0 duration-300 relative overflow-hidden",
        uiConfig.pagePaddingClass
      )}
    >
      {floatingImages.length > 0 ? (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          {floatingImages.map((image) => (
            <img
              key={image.id}
              src={image.src}
              alt={image.alt || ""}
              loading="lazy"
              className={cn(
                "absolute select-none rounded-md object-contain",
                image.showOnMobile === false && "hidden md:block"
              )}
              style={{
                left: `${image.x}%`,
                top: `${image.y}%`,
                width: `${image.width}px`,
                opacity: Math.max(0, Math.min(100, image.opacity ?? 100)) / 100,
                transform: `translate(-50%, -50%) rotate(${image.rotation ?? 0}deg)`,
                zIndex: image.zIndex ?? 0,
              }}
            />
          ))}
        </div>
      ) : null}

      <div className={cn("relative z-10", uiConfig.pageSpacingClass)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">{form.name}</h1>
          <p className="text-muted-foreground">Pit scouting</p>
        </div>
      </div>

      {(currentPage?.title || currentPage?.description || (uiConfig.nav?.showProgress && isPaged)) && (
        <div
          className={cn(
            "rounded-lg border bg-muted/30 p-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-300",
            uiConfig.pageHeaderClassName
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              {currentPage?.title ? (
                <h2 className="text-xl font-semibold">{currentPage.title}</h2>
              ) : null}
              {currentPage?.description ? (
                <p className="text-sm text-muted-foreground">{currentPage.description}</p>
              ) : null}
            </div>
            {uiConfig.nav?.showProgress && isPaged ? (
              <span className="text-xs text-muted-foreground">
                Page {pageIndex + 1} of {displayPageCount}
              </span>
            ) : null}
          </div>
        </div>
      )}

      <div
        key={currentPage.id}
        className={cn(
          "animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
          uiConfig.sectionSpacingClass
        )}
      >
        {showBaseInfo ? (
          <Card
            className={cn(
              "border-muted/60 animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
              uiConfig.sectionCardClassName
            )}
          >
            <CardHeader className={cn("space-y-2", uiConfig.sectionHeaderClassName)}>
              <CardTitle className="text-xl">Pit Scouting Info</CardTitle>
              <CardDescription>Enter the team info before filling out the form.</CardDescription>
              <p className={cn("text-xs", eventName && scoutName ? "text-muted-foreground" : "text-destructive")}>
                Auto-filled: Event {eventName || "not set"} • Scout {scoutName || "not set"}
              </p>
            </CardHeader>
            <CardContent className={cn(uiConfig.fieldSpacingClass)}>
              <div className="grid gap-4 md:grid-cols-2">
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
              </div>
            </CardContent>
          </Card>
        ) : null}

        {currentPage.sections.map((section) => (
          <Card
            key={section.id}
            className={cn(
              "border-muted/60 animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
              uiConfig.sectionCardClassName
            )}
          >
            <CardHeader className={cn("space-y-2", uiConfig.sectionHeaderClassName)}>
              <CardTitle className="text-xl">{section.title}</CardTitle>
              {section.description ? (
                <CardDescription>{section.description}</CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className={cn(uiConfig.fieldSpacingClass)}>
              {section.fields.map((field) => {
                const fieldValue = values[field.id];
                const isRequired = Boolean(field.required);
                const fieldError = errors[field.id];
                const group = normalizeExclusiveGroup(field.exclusiveGroup);
                const activeFieldId = group ? activeExclusiveByGroup[group] : "";
                const isGrayedOut = Boolean(group && activeFieldId && activeFieldId !== field.id);
                const activeFieldLabel = activeFieldId ? fieldMap[activeFieldId]?.label || "another field" : "";

              if (field.type === "long_text") {
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <Textarea
                      value={String(fieldValue ?? "")}
                      onChange={(event) => handleValueChange(field.id, event.target.value)}
                      placeholder={field.placeholder || ""}
                    />
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                );
              }

              if (field.type === "select" || field.type === "radio") {
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
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
                    {field.type === "radio" && field.allowDeselect && typeof fieldValue === "string" && fieldValue.length > 0 ? (
                      <Button
                        variant="ghost"
                        type="button"
                        className="h-7 px-2 text-xs"
                        onClick={() => handleValueChange(field.id, "")}
                        disabled={isGrayedOut}
                      >
                        Clear selection
                      </Button>
                    ) : null}
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                );
              }

              if (field.type === "radio_cards") {
                const isMulti = Boolean(field.multiSelect);
                const selectedValues = Array.isArray(fieldValue) ? (fieldValue as string[]) : [];
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <SpecialMultipleChoice
                      ariaLabel={field.label}
                      options={field.options}
                      multiSelect={isMulti}
                      value={isMulti ? "" : String(fieldValue ?? "")}
                      values={isMulti ? selectedValues : undefined}
                      onValueChange={(value) => handleValueChange(field.id, value)}
                      onValuesChange={(vals) => handleValueChange(field.id, vals)}
                      allowDeselect={Boolean(field.allowDeselect)}
                      disabled={isGrayedOut}
                    />
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                );
              }

              if (field.type === "multi_select") {
                const selected = Array.isArray(fieldValue) ? (fieldValue as string[]) : [];
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="space-y-2">
                      {(field.options || []).map((option) => (
                        <label key={option} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={selected.includes(option)}
                            onCheckedChange={() => handleToggleOption(field.id, option)}
                          />
                          <span className="font-semibold">{option}</span>
                        </label>
                      ))}
                    </div>
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                );
              }

              if (field.type === "checkbox") {
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={Boolean(fieldValue)}
                        onCheckedChange={(value) => handleValueChange(field.id, Boolean(value))}
                      />
                      <span className="font-semibold">
                        {field.label} {isRequired ? "*" : ""}
                      </span>
                      {field.helpText ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                              aria-label={`${field.label} description`}
                            >
                              <CircleHelp className="h-4 w-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            {field.helpText}
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </label>
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                );
              }

              if (field.type === "image") {
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="flex flex-wrap items-center gap-3">
                      <Button variant="outline" type="button" className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 cursor-pointer opacity-0"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            handleImageUpload(field.id, file);
                            event.target.value = "";
                          }}
                        />
                        Upload image
                      </Button>
                      {fieldValue ? (
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => handleValueChange(field.id, "")}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                    {typeof fieldValue === "string" && fieldValue ? (
                      <div className="overflow-hidden rounded-lg border bg-muted">
                        <img
                          src={fieldValue}
                          alt={field.label}
                          className="w-full object-contain"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
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
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
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
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                );
              }

              if (field.type === "rating") {
                const min = field.min ?? 1;
                const max = field.max ?? 5;
                const options = Array.from({ length: max - min + 1 }, (_, idx) => String(min + idx));
                return (
                  <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
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
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
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
                <div key={field.id} className={cn("space-y-2", isGrayedOut && "opacity-50")}>
                  <FieldLabel field={field} isRequired={isRequired} />
                  <Input
                    type={inputType}
                    value={String(fieldValue ?? "")}
                    onChange={(event) => handleValueChange(field.id, event.target.value)}
                    placeholder={field.placeholder || ""}
                  />
                  {isGrayedOut ? (
                    <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                  ) : null}
                  {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                </div>
              );
            })}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className={cn("flex flex-wrap items-center gap-3", isPaged ? "justify-between" : "justify-end")}>
        {isPaged ? (
          <Button
            variant={uiConfig.nav?.backVariant}
            className={cn("transition-transform hover:-translate-y-0.5", uiConfig.nav?.backClassName)}
            onClick={handleBackPage}
            disabled={pageIndex === 0}
          >
            {uiConfig.nav?.backLabel}
          </Button>
        ) : null}
        <div className="flex items-center gap-3">
          {isPaged && pageIndex < displayPageCount - 1 ? (
            <Button
              variant={uiConfig.nav?.nextVariant}
              className={cn("transition-transform hover:-translate-y-0.5", uiConfig.nav?.nextClassName)}
              onClick={handleNextPage}
            >
              {uiConfig.nav?.nextLabel}
            </Button>
          ) : (
            <Button
              variant={uiConfig.nav?.submitVariant}
              className={cn("transition-transform hover:-translate-y-0.5", uiConfig.nav?.submitClassName)}
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? "Saving…" : uiConfig.nav?.submitLabel}
            </Button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default PitScoutingPage;
