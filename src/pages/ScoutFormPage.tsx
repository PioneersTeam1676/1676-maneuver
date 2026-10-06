import { useEffect, useMemo, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { CircleHelp } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumberStepper } from "@/components/ui/number-stepper"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { SpecialMultipleChoice } from "@/components/ui/special-multiple-choice"

import { addIdsToScoutingData } from "@/lib/scoutingDataUtils"
import { saveScoutingEntry } from "@/lib/dexieDB"
import { enqueuePendingSubmission } from "@/lib/pendingScoutingQueue"
import {
  clearDraftScoutingFormValues,
  clearDraftScoutingInputs,
  getDraftScoutingFormValues,
  getDraftScoutingInputs,
  setDraftScoutingFormValues,
  setDraftScoutingInputs,
} from "@/lib/scoutingDraftStore"
import { splitSpecialChoiceOption } from "@/lib/specialChoiceOptions"
import { cn } from "@/lib/utils"
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard"
import { getActiveFormId, readCachedFormDefinition } from "@/lib/activeForm"
import { coercePages, flattenFields, getPageFields, normalizeUiConfig } from "@/lib/formSchema"
import type { FormDefinition, FormField, FormFloatingImage, FormPage } from "@/types/formBuilder"

type ScoutInputs = {
  matchNumber: string
  alliance: string
  scoutName: string
  selectTeam: string
  eventName: string
}

type LocationState = {
  inputs?: ScoutInputs
}

const readPlayerStationDetails = () => {
  if (typeof window === "undefined") {
    return {
      playerStation: "",
      teamPosition: null as number | null,
      alliancePositionLabel: "",
    }
  }

  const playerStation = String(window.localStorage.getItem("playerStation") || "").trim()
  const match = playerStation.toLowerCase().match(/^(red|blue)-([123])$/)
  if (!match) {
    return {
      playerStation,
      teamPosition: null,
      alliancePositionLabel: "",
    }
  }

  const alliance = match[1] === "red" ? "Red" : "Blue"
  const teamPosition = Number(match[2])

  return {
    playerStation,
    teamPosition,
    alliancePositionLabel: `${alliance} ${teamPosition}`,
  }
}

export const HARD_CODED_MATCH_FORM_SOURCE: FormDefinition = JSON.parse(String.raw`{
  "id": "d4385c93-13d1-4e34-8a4a-9dba41ab9ff5",
  "name": "2026 Rebuilt Scouting",
  "year": "2026",
  "description": null,
  "type": "match",
  "status": "published",
  "schema": {
    "pages": [
      {
        "id": "page_1",
        "title": "Auto",
        "description": "",
        "floatingImages": [],
        "sections": [
          {
            "id": "2cf6e6ec-96c0-48ef-b1ab-f7a2cf6758a1",
            "title": "Auto",
            "description": "",
            "imageUrl": "",
            "fields": [
              {
                "id": "field_did_not_show",
                "type": "checkbox",
                "label": "Did Not Show",
                "key": "did_not_show",
                "helpText": "Robot did not appear for this match",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 1,
                "max": 5,
                "step": 1
              },
              {
                "id": "ad376511-3463-4844-8e94-0db7816b6f66",
                "type": "radio_cards",
                "label": "Where did they collect?",
                "key": "",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Outpost ",
                  "Depot ",
                  "Neutral ",
                  "Did Not Collect"
                ],
                "allowDeselect": true,
                "multiSelect": true
              },
              {
                "id": "09c8d987-1eb6-45a0-bef0-42e178701f98",
                "type": "radio_cards",
                "label": "Auto Strat (Primary Scorer)",
                "key": "",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Out of Zone | Grabbing fuel from outside the alliance zone to score",
                  "In Zone Cleanup | Grabbing fuel from inside the alliance zone to score",
                  "Hybrid Scoring | They collect from both inside and outside the alliance zone to score",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "auto_strat",
                "allowDeselect": true
              },
              {
                "id": "4a87fa6a-c863-4a21-9077-118fd4139fd7",
                "type": "radio_cards",
                "label": "Auto Strat (Secondary Role)",
                "key": "",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Passer | Shooting collected balls towards our alliance zone",
                  "Stealing | Takes balls from the other alliance zone",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "auto_strat",
                "allowDeselect": true
              },
              {
                "id": "c3be35d9-a01c-4432-9327-cbd7c8f7d5d8",
                "type": "number",
                "label": "Fuel Estimate",
                "key": "field_auto_strat_rating",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 0,
                "step": 1,
                "stepperButtons": [
                  10,
                  1
                ]
              }
            ]
          }
        ]
      },
      {
        "id": "page_transition",
        "title": "Transition Period",
        "description": "",
        "floatingImages": [],
        "sections": [
          {
            "id": "446b296b-d39f-4677-bb15-5d40c12b57d3",
            "title": "Transition Period",
            "description": "",
            "imageUrl": "",
            "fields": [
              {
                "id": "28636610-f0ca-4aeb-825c-183154d147e5",
                "type": "checkbox",
                "label": "Alliance Won Auto",
                "key": "",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 1,
                "max": 5,
                "step": 1
              },
              {
                "id": "dcc6e6f6-06b0-4abc-ba58-04f2f54b1f00",
                "type": "radio_cards",
                "label": "Transition Period Strat (Primary Scorer)",
                "key": "",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Out of Zone | Grabbing fuel from outside the alliance zone to score",
                  "In Zone Cleanup | Grabbing fuel from inside the alliance zone to score",
                  "Hybrid Scoring | They collect from both inside and outside the alliance zone to score",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "trans_strat",
                "allowDeselect": true
              },
              {
                "id": "26c83867-b2df-42bb-8746-4e1c5318c8d8",
                "type": "radio_cards",
                "label": "Transition Period Strat (Secondary Role)",
                "key": "",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Passer | Shooting collected balls towards our alliance zone",
                  "Stealing | Takes balls from the other alliance zone",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "trans_strat",
                "allowDeselect": true
              },
              {
                "id": "6cf380f6-5743-4433-8e9e-bfbcb7eeb7bf",
                "type": "number",
                "label": "Fuel Estimate",
                "key": "field_transition_period_rating",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 0,
                "step": 1,
                "stepperButtons": [
                  10,
                  1
                ]
              },
              {
                "id": "cf081541-6e69-4ade-99aa-5f93a2a9ea1d",
                "type": "checkbox",
                "label": "Was Defended?",
                "key": "transition_defended",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 1,
                "max": 5,
                "step": 1
              }
            ]
          }
        ]
      },
      {
        "id": "won_s1",
        "title": "Shift 1 \u2014 Inactive",
        "description": "",
        "floatingImages": [],
        "sections": [
          {
            "id": "fe480d90-4b6d-4abc-a702-f09f79b9082c",
            "title": "Shift 1 \u2014 Inactive",
            "description": "",
            "imageUrl": "",
            "fields": [
              {
                "id": "8a59fb0c-3b89-40aa-a3e6-6a95b2123062",
                "type": "radio_cards",
                "label": "Strat (Primary Scorer)",
                "key": "won_s1_primary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Out of Zone | Grabbing fuel from outside the alliance zone to score",
                  "In Zone Cleanup | Grabbing fuel from inside the alliance zone to score",
                  "Hybrid Scoring | They collect from both inside and outside the alliance zone to score",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "won_s1_group",
                "allowDeselect": true
              },
              {
                "id": "3eddc8d4-8568-4625-97e5-81a3029e3ac2",
                "type": "radio_cards",
                "label": "Strat (Secondary Role)",
                "key": "won_s1_secondary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Passer | Shooting collected balls towards our alliance zone",
                  "Stealing | Takes balls from the other alliance zone",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "won_s1_group",
                "allowDeselect": true
              },
              {
                "id": "fb13b8e7-891b-415f-9a56-2f25fe097e32",
                "type": "number",
                "label": "Fuel Estimate",
                "key": "won_s1_rating",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 0,
                "step": 1,
                "stepperButtons": [
                  10,
                  1
                ]
              },
              {
                "id": "1621317d-94d5-44d9-a7dd-82a40dd94f49",
                "type": "checkbox",
                "label": "Was Defended?",
                "key": "won_s1_defended",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 1,
                "max": 5,
                "step": 1
              }
            ]
          }
        ]
      },
      {
        "id": "won_s2",
        "title": "Shift 2 \u2014 Active",
        "description": "",
        "floatingImages": [],
        "sections": [
          {
            "id": "d09fe0fd-f464-4600-b658-9f7b4ee57efd",
            "title": "Shift 2 \u2014 Active",
            "description": "",
            "imageUrl": "",
            "fields": [
              {
                "id": "bf20d10e-6fd6-4f25-965a-223815d0e518",
                "type": "radio_cards",
                "label": "Strat (Primary Scorer)",
                "key": "won_s2_primary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Out of Zone | Grabbing fuel from outside the alliance zone to score",
                  "In Zone Cleanup | Grabbing fuel from inside the alliance zone to score",
                  "Hybrid Scoring | They collect from both inside and outside the alliance zone to score",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "won_s2_group",
                "allowDeselect": true
              },
              {
                "id": "e05ee312-eb89-43cd-b16e-21c50007887b",
                "type": "radio_cards",
                "label": "Strat (Secondary Role)",
                "key": "won_s2_secondary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Passer | Shooting collected balls towards our alliance zone",
                  "Stealing | Takes balls from the other alliance zone",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "won_s2_group",
                "allowDeselect": true
              },
              {
                "id": "d6a9402c-23a6-46ef-8b68-bb547256b55c",
                "type": "number",
                "label": "Fuel Estimate",
                "key": "won_s2_rating",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 0,
                "step": 1,
                "stepperButtons": [
                  10,
                  1
                ]
              },
              {
                "id": "8f03f6d1-c9f3-46bc-a40d-ea9f5c81206c",
                "type": "checkbox",
                "label": "Was Defended?",
                "key": "won_s2_defended",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 1,
                "max": 5,
                "step": 1
              }
            ]
          }
        ]
      },
      {
        "id": "won_s3",
        "title": "Shift 3 \u2014 Inactive",
        "description": "",
        "floatingImages": [],
        "sections": [
          {
            "id": "22a4e6d2-93e5-4b7d-894c-c0a337e3674f",
            "title": "Shift 3 \u2014 Inactive",
            "description": "",
            "imageUrl": "",
            "fields": [
              {
                "id": "629bb089-15c5-40d2-a49c-4f5c6a5736e4",
                "type": "radio_cards",
                "label": "Strat (Primary Scorer)",
                "key": "won_s3_primary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Out of Zone | Grabbing fuel from outside the alliance zone to score",
                  "In Zone Cleanup | Grabbing fuel from inside the alliance zone to score",
                  "Hybrid Scoring | They collect from both inside and outside the alliance zone to score",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "won_s3_group",
                "allowDeselect": true
              },
              {
                "id": "84028f4b-2759-48e2-88b6-cd562eaf7b13",
                "type": "radio_cards",
                "label": "Strat (Secondary Role)",
                "key": "won_s3_secondary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Passer | Shooting collected balls towards our alliance zone",
                  "Stealing | Takes balls from the other alliance zone",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "won_s3_group",
                "allowDeselect": true
              },
              {
                "id": "81b23eeb-8685-405e-b07c-0a0ffcd88a70",
                "type": "number",
                "label": "Fuel Estimate",
                "key": "won_s3_rating",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 0,
                "step": 1,
                "stepperButtons": [
                  10,
                  1
                ]
              },
              {
                "id": "073b72e2-7e85-4b4c-9f0c-3c60f6c56640",
                "type": "checkbox",
                "label": "Was Defended?",
                "key": "won_s3_defended",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 1,
                "max": 5,
                "step": 1
              }
            ]
          }
        ]
      },
      {
        "id": "won_s4",
        "title": "Shift 4 \u2014 Active",
        "description": "",
        "floatingImages": [],
        "sections": [
          {
            "id": "d36f4054-980a-4c65-a2ac-f50469c42a24",
            "title": "Shift 4 \u2014 Active",
            "description": "",
            "imageUrl": "",
            "fields": [
              {
                "id": "25b5b6a3-8f63-4b32-8ff6-77bb52a77acc",
                "type": "radio_cards",
                "label": "Strat (Primary Scorer)",
                "key": "won_s4_primary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Out of Zone | Grabbing fuel from outside the alliance zone to score",
                  "In Zone Cleanup | Grabbing fuel from inside the alliance zone to score",
                  "Hybrid Scoring | They collect from both inside and outside the alliance zone to score",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "won_s4_group",
                "allowDeselect": true
              },
              {
                "id": "425b8057-7dd7-453a-bbaf-10327cbb2774",
                "type": "radio_cards",
                "label": "Strat (Secondary Role)",
                "key": "won_s4_secondary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Passer | Shooting collected balls towards our alliance zone",
                  "Stealing | Takes balls from the other alliance zone",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "won_s4_group",
                "allowDeselect": true
              },
              {
                "id": "988346e7-33c1-44c2-9e7e-ac5d3e0c55c1",
                "type": "number",
                "label": "Fuel Estimate",
                "key": "won_s4_rating",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 0,
                "step": 1,
                "stepperButtons": [
                  10,
                  1
                ]
              },
              {
                "id": "016b075e-5e8c-4c42-bde5-2e86761f86d0",
                "type": "checkbox",
                "label": "Was Defended?",
                "key": "won_s4_defended",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 1,
                "max": 5,
                "step": 1
              }
            ]
          }
        ]
      },
      {
        "id": "lost_s1",
        "title": "Shift 1 \u2014 Active",
        "description": "",
        "floatingImages": [],
        "sections": [
          {
            "id": "c87fca8c-214b-4688-a1b7-fa29a2410e1f",
            "title": "Shift 1 \u2014 Active",
            "description": "",
            "imageUrl": "",
            "fields": [
              {
                "id": "ca28ce81-7b80-4f47-bf24-42c95e0d80e9",
                "type": "radio_cards",
                "label": "Strat (Primary Scorer)",
                "key": "lost_s1_primary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Out of Zone | Grabbing fuel from outside the alliance zone to score",
                  "In Zone Cleanup | Grabbing fuel from inside the alliance zone to score",
                  "Hybrid Scoring | They collect from both inside and outside the alliance zone to score",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "lost_s1_group",
                "allowDeselect": true
              },
              {
                "id": "ba14bc9d-c007-41a6-a002-3071e21d55db",
                "type": "radio_cards",
                "label": "Strat (Secondary Role)",
                "key": "lost_s1_secondary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Passer | Shooting collected balls towards our alliance zone",
                  "Stealing | Takes balls from the other alliance zone",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "lost_s1_group",
                "allowDeselect": true
              },
              {
                "id": "a64be47a-8794-41fc-9598-e24e00c83c5e",
                "type": "number",
                "label": "Fuel Estimate",
                "key": "lost_s1_rating",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 0,
                "step": 1,
                "stepperButtons": [
                  10,
                  1
                ]
              },
              {
                "id": "0b194e69-cdaa-453f-9c3b-1b8b9c70221e",
                "type": "checkbox",
                "label": "Was Defended?",
                "key": "lost_s1_defended",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 1,
                "max": 5,
                "step": 1
              }
            ]
          }
        ]
      },
      {
        "id": "lost_s2",
        "title": "Shift 2 \u2014 Inactive",
        "description": "",
        "floatingImages": [],
        "sections": [
          {
            "id": "aa8c9550-45dd-4959-abd3-eaa53244645e",
            "title": "Shift 2 \u2014 Inactive",
            "description": "",
            "imageUrl": "",
            "fields": [
              {
                "id": "df5c50e0-1f14-4944-9309-3c9942109558",
                "type": "radio_cards",
                "label": "Strat (Primary Scorer)",
                "key": "lost_s2_primary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Out of Zone | Grabbing fuel from outside the alliance zone to score",
                  "In Zone Cleanup | Grabbing fuel from inside the alliance zone to score",
                  "Hybrid Scoring | They collect from both inside and outside the alliance zone to score",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "lost_s2_group",
                "allowDeselect": true
              },
              {
                "id": "85b9e8ba-a480-4048-9384-da53ae461af4",
                "type": "radio_cards",
                "label": "Strat (Secondary Role)",
                "key": "lost_s2_secondary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Passer | Shooting collected balls towards our alliance zone",
                  "Stealing | Takes balls from the other alliance zone",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "lost_s2_group",
                "allowDeselect": true
              },
              {
                "id": "fd557402-7f7b-4b63-8a43-3d39249d45fb",
                "type": "number",
                "label": "Fuel Estimate",
                "key": "lost_s2_rating",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 0,
                "step": 1,
                "stepperButtons": [
                  10,
                  1
                ]
              },
              {
                "id": "c27c9248-31df-4071-a226-35d2f9d68399",
                "type": "checkbox",
                "label": "Was Defended?",
                "key": "lost_s2_defended",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 1,
                "max": 5,
                "step": 1
              }
            ]
          }
        ]
      },
      {
        "id": "lost_s3",
        "title": "Shift 3 \u2014 Active",
        "description": "",
        "floatingImages": [],
        "sections": [
          {
            "id": "20d7240e-d62f-4f19-88a0-bd53677b08e1",
            "title": "Shift 3 \u2014 Active",
            "description": "",
            "imageUrl": "",
            "fields": [
              {
                "id": "597f90e7-9656-40ca-8c3b-1b6bf56eb9c6",
                "type": "radio_cards",
                "label": "Strat (Primary Scorer)",
                "key": "lost_s3_primary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Out of Zone | Grabbing fuel from outside the alliance zone to score",
                  "In Zone Cleanup | Grabbing fuel from inside the alliance zone to score",
                  "Hybrid Scoring | They collect from both inside and outside the alliance zone to score",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "lost_s3_group",
                "allowDeselect": true
              },
              {
                "id": "a0d2762a-ffdc-43ee-b41f-663cae8809e7",
                "type": "radio_cards",
                "label": "Strat (Secondary Role)",
                "key": "lost_s3_secondary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Passer | Shooting collected balls towards our alliance zone",
                  "Stealing | Takes balls from the other alliance zone",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "lost_s3_group",
                "allowDeselect": true
              },
              {
                "id": "3db2f1c3-6662-49ee-b8ee-c0ae95cf5a22",
                "type": "number",
                "label": "Fuel Estimate",
                "key": "lost_s3_rating",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 0,
                "step": 1,
                "stepperButtons": [
                  10,
                  1
                ]
              },
              {
                "id": "7568b4cd-f98e-4f29-9d81-49def8ea5066",
                "type": "checkbox",
                "label": "Was Defended?",
                "key": "lost_s3_defended",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 1,
                "max": 5,
                "step": 1
              }
            ]
          }
        ]
      },
      {
        "id": "lost_s4",
        "title": "Shift 4 \u2014 Inactive",
        "description": "",
        "floatingImages": [],
        "sections": [
          {
            "id": "6544a9c3-646b-42b7-9a79-2630ef60679d",
            "title": "Shift 4 \u2014 Inactive",
            "description": "",
            "imageUrl": "",
            "fields": [
              {
                "id": "4cd9668e-a74b-437b-85da-abcb6a6a8413",
                "type": "radio_cards",
                "label": "Strat (Primary Scorer)",
                "key": "lost_s4_primary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Out of Zone | Grabbing fuel from outside the alliance zone to score",
                  "In Zone Cleanup | Grabbing fuel from inside the alliance zone to score",
                  "Hybrid Scoring | They collect from both inside and outside the alliance zone to score",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "lost_s4_group",
                "allowDeselect": true
              },
              {
                "id": "d4a1effe-b56d-4a29-974a-424e9c799345",
                "type": "radio_cards",
                "label": "Strat (Secondary Role)",
                "key": "lost_s4_secondary",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Passer | Shooting collected balls towards our alliance zone",
                  "Stealing | Takes balls from the other alliance zone",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "exclusiveGroup": "lost_s4_group",
                "allowDeselect": true
              },
              {
                "id": "fa653b43-6fcd-4837-b01c-d164e9ce3459",
                "type": "number",
                "label": "Fuel Estimate",
                "key": "lost_s4_rating",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 0,
                "step": 1,
                "stepperButtons": [
                  10,
                  1
                ]
              },
              {
                "id": "8177a8e9-d760-4935-978d-566a683cb147",
                "type": "checkbox",
                "label": "Was Defended?",
                "key": "lost_s4_defended",
                "helpText": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 1,
                "max": 5,
                "step": 1
              }
            ]
          }
        ]
      },
      {
        "id": "103c0ec2-ae7d-410a-811b-02165bdd69ec",
        "title": "Endgame + Post-match",
        "description": "",
        "floatingImages": [],
        "sections": [
          {
            "id": "5360b2f5-1df1-4d6b-8b68-8ec0f85a27b2",
            "title": "Endgame Period",
            "description": "",
            "imageUrl": "",
            "fields": [
              {
                "id": "c62d2553-5f9c-4376-ac55-dba88394b4b2",
                "type": "radio_cards",
                "label": "Endgame Strat (Primary Scorer)",
                "key": "",
                "helpText": "",
                "exclusiveGroup": "endgame_strat",
                "required": false,
                "placeholder": "",
                "options": [
                  "Out of Zone | Grabbing fuel from outside the alliance zone to score",
                  "In Zone Cleanup | Grabbing fuel from inside the alliance zone to score",
                  "Hybrid Scoring | They collect from both inside and outside the alliance zone to score",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "min": 1,
                "max": 5,
                "step": 1,
                "allowDeselect": true
              },
              {
                "id": "734a977c-67fa-4ad0-9d6b-58e4d72df44d",
                "type": "radio_cards",
                "label": "Endgame Strat (Secondary Role)",
                "key": "",
                "helpText": "",
                "exclusiveGroup": "endgame_strat",
                "required": false,
                "placeholder": "",
                "options": [
                  "Passer | Shooting collected balls towards our alliance zone",
                  "Stealing | Takes balls from the other alliance zone",
                  "Was Defending",
                  "Non-Functioning | The robot broke down mid match"
                ],
                "min": 1,
                "max": 5,
                "step": 1,
                "allowDeselect": true
              },
              {
                "id": "2b97eb28-244f-4263-bd9c-958bb1242e95",
                "type": "number",
                "label": "Fuel Estimate",
                "key": "field_endgame_strat_rating",
                "helpText": "",
                "exclusiveGroup": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 0,
                "step": 1,
                "stepperButtons": [
                  10,
                  1
                ]
              },
              {
                "id": "6e800d24-1ed6-4dd4-b151-08d0f2983223",
                "type": "radio_cards",
                "label": "Climb",
                "key": "endgame_climb",
                "helpText": "",
                "exclusiveGroup": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "L3",
                  "L2",
                  "L1",
                  "Attempted but failed"
                ],
                "allowDeselect": true
              },
              {
                "id": "08de0e27-aaab-4eef-b1a9-1edda366e8fd",
                "type": "radio_cards",
                "label": "Climb Success",
                "key": "endgame_climb_success",
                "helpText": "",
                "exclusiveGroup": "",
                "required": false,
                "placeholder": "",
                "options": [
                  "Successful climb",
                  "Attempted but failed",
                  "Did not attempt climb"
                ],
                "allowDeselect": true
              },
              {
                "id": "82339a05-8d46-40c1-98b8-bda2dbf0f73f",
                "type": "checkbox",
                "label": "Was Defended?",
                "key": "endgame_defended",
                "helpText": "",
                "exclusiveGroup": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 1,
                "max": 5,
                "step": 1
              }
            ]
          },
          {
            "id": "e7ffe94d-6d46-4701-a871-80454af7a956",
            "title": "Post-match",
            "description": "",
            "imageUrl": "",
            "fields": [
              {
                "id": "6c6b3f79-329f-4535-8271-f278595857c3",
                "type": "short_text",
                "label": "Notes",
                "key": "",
                "helpText": "",
                "exclusiveGroup": "",
                "required": false,
                "placeholder": "",
                "options": [],
                "min": 1,
                "max": 5,
                "step": 1
              }
            ]
          }
        ]
      }
    ],
    "ui": {
      "layout": "auto",
      "pagePaddingClass": "py-8",
      "pageSpacingClass": "space-y-6",
      "sectionSpacingClass": "space-y-6",
      "fieldSpacingClass": "space-y-4",
      "sectionCardClassName": "",
      "sectionHeaderClassName": "space-y-2",
      "pageHeaderClassName": "",
      "nav": {
        "showProgress": true,
        "backLabel": "Back",
        "nextLabel": "Next",
        "submitLabel": "Submit",
        "backVariant": "outline",
        "nextVariant": "default",
        "submitVariant": "default",
        "backClassName": "",
        "nextClassName": "",
        "submitClassName": ""
      }
    },
    "sections": []
  },
  "createdAt": "2026-01-27T13:27:35.000Z",
  "updatedAt": "2026-02-23T23:16:34.000Z"
}`) as FormDefinition

const normalizeKey = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "field"

const isEmptyValue = (value: unknown, field: FormField) => {
  if (value === undefined || value === null) return true
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === "string") return value.trim() === ""
  if (field.type === "checkbox") return value !== true
  return false
}

const getInitialValue = (field: FormField) => {
  if (field.type === "checkbox") return false
  if (field.type === "multi_select") return [] as string[]
  if ((field.type === "radio" || field.type === "radio_cards") && field.multiSelect) return [] as string[]
  if (field.type === "image") return ""
  if (field.type === "rating" || field.type === "number" || field.type === "slider") return field.min ?? 0
  if (isStratChoiceField(field)) {
    const nonFuncOption = (field.options || []).find((opt) =>
      hasKeyword(splitSpecialChoiceOption(opt).title, NON_FUNCTIONING_KEYWORDS)
    )
    return nonFuncOption ?? ""
  }
  return ""
}

const normalizeExclusiveGroup = (value?: string) =>
  typeof value === "string" ? value.trim().toLowerCase() : ""

const isAutoCollectionField = (label: string) =>
  label.trim().toLowerCase().includes("where did they collect in auto")

const isGenericCollectionPrompt = (label: string) =>
  label.trim().toLowerCase().includes("where did they collect")

const CLIMB_SPECIAL_MCQ_OPTIONS = ["Yes", "Attempted but failed", "No"]

const isClimbSpecialField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  const options = field.options || []
  if (label !== "climb?") return false
  if (options.length !== CLIMB_SPECIAL_MCQ_OPTIONS.length) return false
  const normalized = options.map((option) => splitSpecialChoiceOption(option).title.trim().toLowerCase())
  return CLIMB_SPECIAL_MCQ_OPTIONS.every((option) => normalized.includes(option.toLowerCase()))
}

const isAutoInteractionField = (field?: FormField) => {
  if (!field) return false
  const label = (field.label || "").trim().toLowerCase()
  const key = (field.key || "").trim().toLowerCase()
  return (
    isAutoCollectionField(label) ||
    isClimbSpecialField(field) ||
    label.includes("auto") ||
    key.includes("auto")
  )
}

const isAutoStrategyField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  if (isAutoCollectionField(label)) return false
  return label.includes("auto") && (label.includes("strat") || label.includes("strategy"))
}

const STATUS_KEYWORDS = [
  "did not show",
]

const NON_FUNCTIONING_KEYWORDS = ["non-functioning", "non functioning", "not functioning"]

const normalizeOptionTitle = (value: string) => splitSpecialChoiceOption(value).title.trim().toLowerCase()

const normalizeOptionDisplayText = (value: string) => {
  const parsed = splitSpecialChoiceOption(value)
  const normalizedTitle =
    parsed.title.trim().toLowerCase() === "hybrid scoring" ? "Hybrid" : parsed.title
  if (normalizedTitle === parsed.title) return value
  return parsed.description ? `${normalizedTitle} | ${parsed.description}` : normalizedTitle
}

const isAutoPageLike = (page: FormPage) => {
  const title = (page.title || "").trim().toLowerCase()
  const pageId = (page.id || "").trim().toLowerCase()
  return title.includes("auto") || pageId.includes("auto")
}

const normalizeAutoCollectionField = (field: FormField, onAutoPage: boolean): FormField => {
  const label = field.label || ""
  const shouldConvert =
    isAutoCollectionField(label) ||
    (onAutoPage && isGenericCollectionPrompt(label))
  if (!shouldConvert) return field
  return {
    ...field,
    type: "radio_cards",
    label: "Climb?",
    options: CLIMB_SPECIAL_MCQ_OPTIONS,
    multiSelect: false,
    allowDeselect: false,
  }
}

const normalizeFieldOptionLabels = (field: FormField): FormField => {
  if (!Array.isArray(field.options) || field.options.length === 0) return field
  const nextOptions = field.options.map((option) => normalizeOptionDisplayText(option))
  const changed = nextOptions.some((option, index) => option !== field.options?.[index])
  if (!changed) return field
  return { ...field, options: nextOptions }
}

const normalizePagesOptionLabels = (pages: FormPage[]): FormPage[] =>
  pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => ({
      ...section,
      fields: (section.fields || [])
        .map((field) => normalizeAutoCollectionField(field, isAutoPageLike(page)))
        .map((field) => normalizeFieldOptionLabels(field)),
    })),
  }))

const hasKeyword = (value: string, keywords: string[]) => {
  const normalized = value.trim().toLowerCase()
  return keywords.some((keyword) => normalized.includes(keyword))
}

const isNonFunctioningLabel = (value: string) => hasKeyword(value, NON_FUNCTIONING_KEYWORDS)

const isStatusField = (field: FormField) => {
  const label = field.label || ""
  if (hasKeyword(label, STATUS_KEYWORDS)) return true
  return (field.options || []).some((option) => hasKeyword(normalizeOptionTitle(option), STATUS_KEYWORDS))
}

const isPredictionField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  return label.includes("prediction") || (label.includes("winner") && label.includes("alliance"))
}

const isRedOption = (option: string) => {
  const title = normalizeOptionTitle(option)
  return title === "red" || title.startsWith("red ") || title.includes("red alliance")
}

const isBlueOption = (option: string) => {
  const title = normalizeOptionTitle(option)
  return title === "blue" || title.startsWith("blue ") || title.includes("blue alliance")
}

const hasRedBlueOptions = (field: FormField) => {
  const options = field.options || []
  return options.some((option) => isRedOption(option)) && options.some((option) => isBlueOption(option))
}

const isAllianceWonAutoField = (field: FormField) => {
  const label = (field.label || "").toLowerCase()
  return field.type === "checkbox" && label.includes("alliance") && label.includes("won") && label.includes("auto")
}

const hasEstimateOrRatingValue = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  const key = (field.key || "").trim().toLowerCase()
  return (
    label.includes("rate") ||
    label.includes("rating") ||
    label.includes("estimate") ||
    key.includes("rating") ||
    key.includes("estimate")
  )
}

const isStratRateField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  const key = (field.key || "").trim().toLowerCase()
  return (
    hasEstimateOrRatingValue(field) &&
    (
      label.includes("strat") ||
      label.includes("strategy") ||
      label.includes("shift") ||
      label.includes("auto") ||
      label.includes("endgame") ||
      key.includes("rating") ||
      key.includes("estimate")
    )
  )
}

const isTransitionRatingField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  const key = (field.key || "").trim().toLowerCase()
  return hasEstimateOrRatingValue(field) && (label.includes("transition") || key.includes("transition"))
}

const isWideRatingField = (field: FormField) =>
  isStratRateField(field) || isTransitionRatingField(field)

const isStratChoiceField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  const key = (field.key || "").trim().toLowerCase()
  const strategyContext =
    label.includes("strat") ||
    label.includes("strategy") ||
    key.includes("strat") ||
    key.includes("strategy")
  const roleContext = label.includes("role") || key.includes("role")
  if (!(strategyContext || roleContext)) return false
  return !label.includes("rate") && !label.includes("rating")
}

const isSecondaryStratRoleField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  const key = (field.key || "").trim().toLowerCase()
  return isStratChoiceField(field) && (label.includes("secondary") || key.includes("secondary"))
}

const withSecondaryDefenseOption = (field: FormField, options: string[]) => {
  if (!isSecondaryStratRoleField(field)) return options
  let result = options.map((opt) => {
    if (splitSpecialChoiceOption(opt).title.trim().toLowerCase() === "defense") return "Was Defending"
    return opt
  })
  const hasDefense = result.some((option) => {
    const t = splitSpecialChoiceOption(option).title.trim().toLowerCase()
    return t === "was defending" || t === "defense"
  })
  if (!hasDefense) result = [...result, "Was Defending"]
  const hasNonFunc = result.some((option) =>
    hasKeyword(splitSpecialChoiceOption(option).title, NON_FUNCTIONING_KEYWORDS)
  )
  if (!hasNonFunc) result = [...result, "Non-Functioning"]
  return result
}

const normalizeStratRoleSignature = (value: string) =>
  value
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\b(primary|secondary|first|second|1st|2nd)\b/g, " ")
    .replace(/\b(role|scorer)\b/g, " ")
    .replace(/\b\d+\b/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")

const getStratRoleSignature = (field: FormField) => {
  const keySignature = normalizeStratRoleSignature(field.key || "")
  const labelSignature = normalizeStratRoleSignature(field.label || "")
  return keySignature || labelSignature || "__strat_role__"
}

const mergeStratRoleOptions = (optionGroups: string[][]) => {
  const merged: string[] = []
  const seen = new Set<string>()

  optionGroups.forEach((options) => {
    options.forEach((option) => {
      const signature = normalizeOptionTitle(option)
      if (!signature || seen.has(signature)) return
      seen.add(signature)
      merged.push(option)
    })
  })

  return merged
}

const normalizeMergedStratRoleLabel = (label: string) => {
  const normalized = String(label || "")
    .replace(/\(([^)]*(primary|secondary)[^)]*)\)/gi, " ")
    .replace(/\b(primary|secondary)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
  return normalized || "Strategy Role"
}

const mergeStratRolesForPages = (pages: FormPage[]): FormPage[] =>
  pages.map((page) => {
    const pageFields = page.sections.flatMap((section) => section.fields || [])
    const primaryFields = pageFields.filter(
      (field) => isStratChoiceField(field) && !isSecondaryStratRoleField(field)
    )
    const primarySignatures = new Set(primaryFields.map((field) => getStratRoleSignature(field)))
    const firstPrimaryFieldId = primaryFields[0]?.id || ""

    const secondaryBySignature = new Map<string, FormField[]>()
    pageFields.forEach((field) => {
      if (!isSecondaryStratRoleField(field)) return
      const signature = getStratRoleSignature(field)
      const existing = secondaryBySignature.get(signature) || []
      existing.push(field)
      secondaryBySignature.set(signature, existing)
    })
    const unmatchedSecondaryOptions = Array.from(secondaryBySignature.entries())
      .filter(([signature]) => !primarySignatures.has(signature))
      .flatMap(([, fields]) =>
        fields.flatMap((secondaryField) =>
          withSecondaryDefenseOption(secondaryField, secondaryField.options || [])
        )
      )

    return {
      ...page,
      sections: page.sections.map((section) => ({
        ...section,
        fields: (section.fields || []).flatMap((field) => {
          if (isSecondaryStratRoleField(field)) {
            const signature = getStratRoleSignature(field)
            if (primarySignatures.has(signature) || primaryFields.length > 0) return []
            return [
              {
                ...field,
                label: normalizeMergedStratRoleLabel(field.label || ""),
                options: withSecondaryDefenseOption(field, field.options || []),
              },
            ]
          }

          if (!isStratChoiceField(field)) return [field]

          const signature = getStratRoleSignature(field)
          const secondaryFields = secondaryBySignature.get(signature) || []
          if (secondaryFields.length === 0) return [field]

          const secondaryOptions = secondaryFields.flatMap((secondaryField) =>
            withSecondaryDefenseOption(secondaryField, secondaryField.options || [])
          )
          const fallbackOptions = field.id === firstPrimaryFieldId ? unmatchedSecondaryOptions : []

          return [
            {
              ...field,
              label: normalizeMergedStratRoleLabel(field.label || ""),
              required: Boolean(field.required || secondaryFields.some((secondaryField) => secondaryField.required)),
              options: mergeStratRoleOptions([field.options || [], secondaryOptions, fallbackOptions]),
            },
          ]
        }),
      })),
    }
  })

const normalizeStratDefenseLabels = (pages: FormPage[]): FormPage[] =>
  pages.map((page) => ({
    ...page,
    sections: page.sections.map((section) => ({
      ...section,
      fields: (section.fields || []).map((field) => {
        const label = (field.label || "").trim().toLowerCase()
        let newLabel = field.label
        if (label === "defended") newLabel = "Was Defended"
        if (label === "defense") newLabel = "Was Defending"

        if (isStratChoiceField(field)) {
          const options = (field.options || []).map((opt) => {
            if (splitSpecialChoiceOption(opt).title.trim().toLowerCase() === "defense") return "Was Defending"
            if (splitSpecialChoiceOption(opt).title.trim().toLowerCase() === "defended") return "Was Defended"
            return opt
          })
          const hasNonFunc = options.some((opt) =>
            hasKeyword(splitSpecialChoiceOption(opt).title, NON_FUNCTIONING_KEYWORDS)
          )
          const finalOptions = hasNonFunc ? options : [...options, "Non-Functioning"]
          return { ...field, label: newLabel, options: finalOptions }
        }

        if (newLabel !== field.label) return { ...field, label: newLabel }
        return field
      }),
    })),
  }))

const isAutoWhereDidTheyCollectField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  return isAutoCollectionField(label)
}

const isClimbField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  if (isAutoCollectionField(label)) return false
  return label.includes("where did they collect") || label.includes("climb")
}

const isMiscField = (field: FormField) => (field.label || "").trim().toLowerCase().includes("misc")

const isDefendedField = (field: FormField) => {
  const label = (field.label || "").trim().toLowerCase()
  return label.includes("defended") || label.includes("defense") || label.includes("defending")
}

const isPlayingDefenseValue = (value: unknown) => {
  if (typeof value !== "string") return false
  const normalized = normalizeOptionTitle(value)
  return normalized === "was defending" || normalized === "defense" || normalized === "playing defense"
}

const isNotesField = (field: FormField) => (field.label || "").trim().toLowerCase().includes("note")

const CLIMB_LEVEL_OPTION_SETS = {
  backup: ["Level 1", "Level 2", "Level 3"],
  active: ["Level 1", "Level 2", "Level 3", "Attempted but failed"],
} as const
const CLIMB_LEVEL_OPTIONS = [...CLIMB_LEVEL_OPTION_SETS.active]

const getFieldPriority = (field: FormField, onTransitionPage = false) => {
  if (onTransitionPage && isAllianceWonAutoField(field)) return -1
  if (onTransitionPage && isTransitionRatingField(field)) return 0
  if (onTransitionPage && isDefendedField(field)) return 2.1
  if (isStatusField(field)) return 1
  return 0
}

const isTransitionPhasePageId = (pageId: string) => /^(won|lost)_s\d+$/i.test(pageId.trim())

const FieldLabel = ({
  field,
  isRequired,
  hideDescription = false,
}: {
  field: FormField
  isRequired: boolean
  hideDescription?: boolean
}) => {
  const description =
    hideDescription || typeof field.helpText !== "string" ? "" : field.helpText.trim()
  return (
    <div className="flex items-center gap-1">
      <Label className="flex-1 text-sm leading-tight">
        {field.label} {isRequired ? "*" : ""}
      </Label>
      {description ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
              aria-label={`${field.label} description`}
            >
              <CircleHelp className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            {description}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </div>
  )
}

const toFiniteNumber = (value: unknown, fallback: number) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const normalizeFloatingImage = (image: FormFloatingImage): FormFloatingImage => ({
  ...image,
  x: toFiniteNumber(image.x, 50),
  y: toFiniteNumber(image.y, 50),
  width: toFiniteNumber(image.width, 200),
  opacity: toFiniteNumber(image.opacity, 100),
  rotation: toFiniteNumber(image.rotation, 0),
  zIndex: toFiniteNumber(image.zIndex, 0),
  showOnMobile: image.showOnMobile !== false,
})

const prepareMatchForm = (raw: FormDefinition) => {
  const pages = normalizeStratDefenseLabels(
    mergeStratRolesForPages(
      normalizePagesOptionLabels(
        coercePages(raw.schema)
      )
    )
  )
  return {
    ...raw,
    schema: {
      ...raw.schema,
      pages,
    },
  }
}

const BUILT_IN_MATCH_FORM = prepareMatchForm(HARD_CODED_MATCH_FORM_SOURCE)

// Which match form to scout with. The built-in form above is this season's
// game. Next season, a lead builds the new form in Form Maker and marks it
// active: once that form (with a different year) is cached on the device it
// is used automatically, with no code change. The active form is ignored
// while it is for the same year as the built-in one, so this season's
// behaviour is unchanged.
const resolveMatchForm = () => {
  try {
    const active = readCachedFormDefinition<FormDefinition>(getActiveFormId("match"))
    const builtInYear = String(HARD_CODED_MATCH_FORM_SOURCE.year || "")
    if (active && active.id !== HARD_CODED_MATCH_FORM_SOURCE.id && active.schema && String(active.year || "") !== builtInYear) {
      const prepared = prepareMatchForm(active)
      if (prepared.schema.pages.length > 0) return prepared
    }
  } catch (error) {
    console.warn("[ScoutFormPage] active match form unusable; using built-in form", error)
  }
  return BUILT_IN_MATCH_FORM
}


const buildInitialMatchValues = (form: ReturnType<typeof prepareMatchForm>) => {
  const nextValues: Record<string, unknown> = {}
  form.schema.pages.forEach((page) => {
    page.sections.forEach((section) => {
      section.fields.forEach((field) => {
        nextValues[field.id] = getInitialValue(field)
      })
    })
  })
  return nextValues
}

const toggleOptionValue = (current: unknown, option: string) => {
  const selected = Array.isArray(current) ? current.filter((value): value is string => typeof value === "string") : []
  return selected.includes(option)
    ? selected.filter((value) => value !== option)
    : [...selected, option]
}

export default function ScoutFormPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as LocationState | null
  useUnsavedChangesGuard(true)
  const inputs = state?.inputs ?? getDraftScoutingInputs<ScoutInputs>() ?? undefined
  // Resolved once per visit so a newly activated form applies on the next match.
  const [form] = useState(resolveMatchForm)
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const draft = getDraftScoutingFormValues<Record<string, unknown>>()
    return draft && typeof draft === "object" ? { ...buildInitialMatchValues(form), ...draft } : buildInitialMatchValues(form)
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)

  useEffect(() => {
    if (!inputs) {
      navigate("/game-start", { replace: true })
      return
    }
    setDraftScoutingInputs(inputs)
  }, [inputs, navigate])

  useEffect(() => {
    setDraftScoutingFormValues(values)
  }, [values])

  const pages = useMemo(() => coercePages(form?.schema), [form])
  const uiConfig = useMemo(() => normalizeUiConfig(form?.schema?.ui), [form])
  const compactFieldSpacingClass = useMemo(
    () => (uiConfig.fieldSpacingClass || "").replace(/\bspace-y-\d+\b/g, "").trim(),
    [uiConfig.fieldSpacingClass]
  )
  const layoutMode = uiConfig.layout || "auto"
  const isPaged = layoutMode === "paged" || (layoutMode === "auto" && pages.length > 1)
  const displayPages = useMemo(() => {
    if (isPaged) return pages
    const allSections = pages.flatMap((page) => page.sections)
    const allFloatingImages = pages.flatMap((page) => page.floatingImages || [])
    return [
      {
        id: "page_all",
        title: "",
        description: "",
        floatingImages: allFloatingImages,
        sections: allSections,
      },
    ]
  }, [isPaged, pages])
  const displayPageCount = displayPages.length
  const currentPage = displayPages[Math.min(pageIndex, displayPageCount - 1)] || displayPages[0]
  const currentPageFields = useMemo(() => getPageFields(currentPage), [currentPage])
  const allFields = useMemo(() => flattenFields(form?.schema), [form])
  const fieldMap = useMemo(
    () => Object.fromEntries(allFields.map((field) => [field.id, field])),
    [allFields]
  )
  const didNotShowActive = currentPageFields.some(f => f.id === "field_did_not_show") && values["field_did_not_show"] === true
  const activeExclusiveByGroup = useMemo(() => {
    const next: Record<string, string> = {}
    allFields.forEach((field) => {
      const group = normalizeExclusiveGroup(field.exclusiveGroup)
      if (!group || next[group]) return
      if (!isEmptyValue(values[field.id], field)) {
        next[group] = field.id
      }
    })
    return next
  }, [allFields, values])
  const floatingImages = useMemo(
    () =>
      (currentPage?.floatingImages || [])
        .filter((image) => typeof image.src === "string" && image.src.trim().length > 0)
        .map(normalizeFloatingImage),
    [currentPage]
  )

  const isTransitionPage = currentPage.id === "page_transition" || (currentPage.title || "").toLowerCase().includes("transition")
  const isAutoPage = (currentPage.title || "").toLowerCase().includes("auto") || currentPage.id.toLowerCase().includes("auto")
  const isTransitionOrPhasePage = isTransitionPage || isTransitionPhasePageId(currentPage.id)
  const isEndgamePage = (currentPage.title || "").toLowerCase().includes("endgame") || currentPage.id.toLowerCase().includes("endgame")
  const isPostMatchPage = (currentPage.title || "").toLowerCase().includes("post") || currentPage.id.toLowerCase().includes("post_match") || currentPage.id.toLowerCase().includes("post-match")

  // Auto = 0, Transition = 1, Shifts 1-4 = 2-5, Endgame = 6
  const logicalPageNumber = useMemo(() => {
    const id = currentPage.id
    if (isAutoPage) return 0
    const shiftMatch = id.match(/^(?:won|lost)_s(\d+)$/)
    if (shiftMatch) return 1 + parseInt(shiftMatch[1])
    if (isEndgamePage) return 6
    // Transition or other pre-shift page
    return 1
  }, [currentPage, isAutoPage, isEndgamePage])

  const logicalPageCount = 6

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, displayPageCount - 1))
  }, [displayPageCount])

  const handleValueChange = (fieldId: string, value: unknown) => {
    setValues((prev) => {
      const changedField = allFields.find((field) => field.id === fieldId)
      const group =
        isAutoPage || isAutoInteractionField(changedField)
          ? ""
          : normalizeExclusiveGroup(changedField?.exclusiveGroup)
      const next = { ...prev, [fieldId]: value }
      if (!changedField || !group || isEmptyValue(value, changedField)) {
        return next
      }
      allFields.forEach((field) => {
        if (field.id === fieldId) return
        if (normalizeExclusiveGroup(field.exclusiveGroup) !== group) return
        if (isAutoInteractionField(field)) return
        next[field.id] = getInitialValue(field)
      })
      return next
    })
    setErrors((prev) => {
      if (!prev[fieldId]) return prev
      const next = { ...prev }
      delete next[fieldId]
      return next
    })
  }

  const handleToggleOption = (fieldId: string, option: string) => {
    setValues((prev) => {
      const current = Array.isArray(prev[fieldId]) ? (prev[fieldId] as string[]) : []
      const exists = current.includes(option)
      const next = exists ? current.filter((item) => item !== option) : [...current, option]
      const changedField = allFields.find((field) => field.id === fieldId)
      const group =
        isAutoPage || isAutoInteractionField(changedField)
          ? ""
          : normalizeExclusiveGroup(changedField?.exclusiveGroup)
      const nextValues: Record<string, unknown> = { ...prev, [fieldId]: next }
      if (!changedField || !group || isEmptyValue(next, changedField)) {
        return nextValues
      }
      allFields.forEach((field) => {
        if (field.id === fieldId) return
        if (normalizeExclusiveGroup(field.exclusiveGroup) !== group) return
        if (isAutoInteractionField(field)) return
        nextValues[field.id] = getInitialValue(field)
      })
      return nextValues
    })
    setErrors((prev) => {
      if (!prev[fieldId]) return prev
      const next = { ...prev }
      delete next[fieldId]
      return next
    })
  }

  const buildSubmission = (currentForm: FormDefinition, scoutInputs: ScoutInputs, valueOverrides?: Record<string, unknown>) => {
    const effectiveValues = valueOverrides ?? values
    const usedKeys = new Set<string>()
    const responseData: Record<string, unknown> = {}
    const stationDetails = readPlayerStationDetails()

    flattenFields(currentForm.schema).forEach((field) => {
      const baseLabel = field.label || field.id
      const rawCustomKey = typeof field.key === "string" ? field.key.trim() : ""
      const customKey = rawCustomKey ? normalizeKey(rawCustomKey) : ""
      const baseKey = customKey || `field_${normalizeKey(baseLabel)}`
      let key = baseKey
      if (usedKeys.has(key)) {
        const fallbackBase = customKey || `field_${normalizeKey(baseLabel)}`
        key = `${fallbackBase}_${field.id.slice(0, 6)}`
      }
      usedKeys.add(key)

      let value = effectiveValues[field.id]
      if (field.type === "number" || field.type === "rating" || field.type === "slider") {
        const num = Number(value)
        value = Number.isFinite(num) ? num : 0
      }
      responseData[key] = value
    })

    return {
      ...scoutInputs,
      formId: currentForm.id,
      formName: currentForm.name,
      formYear: currentForm.year,
      formType: currentForm.type,
      formVersion: currentForm.updatedAt || currentForm.createdAt || null,
      recordedAt: new Date().toISOString(),
      playerStation: stationDetails.playerStation,
      teamPosition: stationDetails.teamPosition,
      alliancePositionLabel: stationDetails.alliancePositionLabel,
      ...responseData,
    }
  }

  const handleImageUpload = (fieldId: string, file?: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : ""
      if (!result) {
        toast.error("Failed to read image.")
        return
      }
      handleValueChange(fieldId, result)
    }
    reader.onerror = () => {
      toast.error("Failed to upload image.")
    }
    reader.readAsDataURL(file)
  }

  const handleNextPage = () => {
    if (!isPaged) return
    const nextErrors: Record<string, string> = {}
    currentPageFields.forEach((field) => {
      if (field.required && isEmptyValue(values[field.id], field)) {
        nextErrors[field.id] = "Required"
      }
    })
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      toast.error("Please fill out all required fields.")
      return
    }

    // Did Not Show: skip all remaining pages and go straight to endgame
    const didNotShowField = currentPageFields.find(f => f.id === "field_did_not_show")
    if (didNotShowField && values[didNotShowField.id] === true) {
      const endgamePage = displayPages.find(p => p.title.toLowerCase().includes("endgame"))
      setPageIndex(endgamePage
        ? displayPages.findIndex(p => p.id === endgamePage.id)
        : displayPageCount - 1)
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    // Shift page routing: stay within same won/lost path, jump to endgame after shift 4
    const shiftMatch = currentPage.id.match(/^(won|lost)_s(\d+)$/)
    if (shiftMatch) {
      const path = shiftMatch[1]
      const shiftNum = parseInt(shiftMatch[2])
      const nextShiftPage = displayPages.find(p => p.id === `${path}_s${shiftNum + 1}`)
      if (nextShiftPage) {
        setPageIndex(displayPages.findIndex(p => p.id === nextShiftPage.id))
      } else {
        const endgamePage = displayPages.find(p => p.title.toLowerCase().includes("endgame"))
        setPageIndex(endgamePage
          ? displayPages.findIndex(p => p.id === endgamePage.id)
          : Math.min(pageIndex + 1, displayPageCount - 1))
      }
      window.scrollTo({ top: 0, behavior: "smooth" })
      return
    }

    // Alliance Won Auto checkbox: route to correct shift path
    for (const field of currentPageFields) {
      const label = field.label.toLowerCase()
      if (field.type === "checkbox" && label.includes("alliance") && label.includes("won") && label.includes("auto")) {
        const path = values[field.id] === true ? "won" : "lost"
        const targetPage = displayPages.find(p => p.id === `${path}_s1`)
        if (targetPage) {
          setPageIndex(displayPages.findIndex(p => p.id === targetPage.id))
          window.scrollTo({ top: 0, behavior: "smooth" })
          return
        }
      }
    }

    // Default: sequential navigation
    setPageIndex((prev) => Math.min(prev + 1, displayPageCount - 1))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleBackPage = () => {
    if (!isPaged) return
    const shiftMatch = currentPage.id.match(/^(won|lost)_s(\d+)$/)
    if (shiftMatch) {
      const path = shiftMatch[1]
      const shiftNum = parseInt(shiftMatch[2])
      if (shiftNum > 1) {
        const prevPage = displayPages.find(p => p.id === `${path}_s${shiftNum - 1}`)
        if (prevPage) {
          setPageIndex(displayPages.findIndex(p => p.id === prevPage.id))
          window.scrollTo({ top: 0, behavior: "smooth" })
          return
        }
      } else {
        const transitionPage = displayPages.find(p => p.id === "page_transition")
        if (transitionPage) {
          setPageIndex(displayPages.findIndex(p => p.id === transitionPage.id))
          window.scrollTo({ top: 0, behavior: "smooth" })
          return
        }
      }
    }

    // On endgame: back to shift 4 of whichever path (won/lost) was taken
    const isEndgame = currentPage.title?.toLowerCase().includes("endgame") || currentPage.id?.toLowerCase().includes("endgame")
    if (isEndgame) {
      const wonAutoField = allFields.find(f => f.type === "checkbox" && f.label.toLowerCase().includes("alliance") && f.label.toLowerCase().includes("won"))
      const path = wonAutoField && values[wonAutoField.id] === true ? "won" : "lost"
      const lastShift = displayPages.find(p => p.id === `${path}_s4`) ?? displayPages.find(p => p.id === `${path}_s3`)
      if (lastShift) {
        setPageIndex(displayPages.findIndex(p => p.id === lastShift.id))
        window.scrollTo({ top: 0, behavior: "smooth" })
        return
      }
    }

    setPageIndex((prev) => Math.max(prev - 1, 0))
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleSubmit = async () => {
    if (!form || !inputs) return
    const didNotShow = values["field_did_not_show"] === true

    if (!didNotShow) {
      const nextErrors: Record<string, string> = {}
      allFields.forEach((field) => {
        if (field.required && isEmptyValue(values[field.id], field)) {
          nextErrors[field.id] = "Required"
        }
      })
      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors)
        toast.error("Please fill out all required fields.")
        return
      }
    }

    setSaving(true)
    try {
      let submissionValues: Record<string, unknown> | undefined
      if (didNotShow) {
        submissionValues = { field_did_not_show: true }
        allFields.forEach((field) => {
          if (field.id === "field_did_not_show") return
          if (field.type === "number" || field.type === "slider" || field.type === "rating") {
            submissionValues![field.id] = 0
          } else if (field.type === "checkbox") {
            submissionValues![field.id] = false
          } else {
            submissionValues![field.id] = null
          }
        })
      }
      const submission = buildSubmission(form, inputs, submissionValues)
      const [entry] = addIdsToScoutingData([submission])
      if (!entry) {
        toast.error("Could not build scouting entry.")
        return
      }

      let savedToDexie = true
      let syncedRemote = false
      let syncError: { name?: string; message?: string } | undefined
      try {
        const result = await saveScoutingEntry(entry)
        syncedRemote = result.syncedRemote
        syncError = result.error
      } catch (error) {
        savedToDexie = false
        const e = error as Error
        console.error("Failed to save scouting entry to local DB", error)
        enqueuePendingSubmission(entry, { name: e?.name, message: e?.message })
        toast.error(
          `Match saved to backup queue. Local DB error: ${e?.name ?? "Unknown"}${e?.message ? `: ${e.message}` : ""}`,
          { duration: 12000 },
        )
      }

      if (savedToDexie && !syncedRemote) {
        enqueuePendingSubmission(entry, syncError)
      }

      if (savedToDexie && syncedRemote) {
        toast.success("Scouting entry synced.")
      } else if (savedToDexie) {
        toast.warning(
          `Entry saved on device — not yet synced${syncError?.message ? ` (${syncError.message})` : ""}. Will retry automatically.`,
          { duration: 10000 },
        )
      }
      clearDraftScoutingInputs()
      clearDraftScoutingFormValues()

      const nextMatchNumber = Number(inputs.matchNumber) + 1
      navigate("/game-start", {
        state: {
          inputs: {
            ...inputs,
            matchNumber: Number.isNaN(nextMatchNumber) ? inputs.matchNumber : String(nextMatchNumber),
            selectTeam: "",
          },
        },
      })
    } catch (error) {
      console.error("Failed to build scouting submission", error)
      const e = error as Error
      toast.error(`Could not submit match: ${e?.name ?? "Error"}${e?.message ? `: ${e.message}` : ""}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !form) {
    return (
      <div className="container mx-auto max-w-4xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>Loading scout form…</CardTitle>
            <CardDescription>Preparing the active scouting form.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "container mx-auto max-w-4xl animate-in fade-in-0 duration-300 relative overflow-hidden px-2 pb-0 !pt-2",
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

      <div className={cn("relative z-10 text-sm", uiConfig.pageSpacingClass)}>
      {isPaged ? (
        <div className="absolute left-0 top-0 z-20 text-xs font-medium text-muted-foreground">
          {logicalPageNumber}/{logicalPageCount}
        </div>
      ) : null}
      <div className="pointer-events-none absolute right-0 top-0 z-20">
        <Button
          variant="outline"
          className="pointer-events-auto"
          onClick={() => navigate("/game-start", { state })}
        >
          Back
        </Button>
      </div>


      <div
        key={currentPage.id}
        className={cn(
          "animate-in fade-in-0 slide-in-from-bottom-2 duration-300 !mt-0",
          uiConfig.sectionSpacingClass
        )}
      >
        {currentPage.sections.map((section) => (
          <Card
            key={section.id}
            className={cn(
              "border-muted/60 animate-in fade-in-0 slide-in-from-bottom-2 duration-300",
              uiConfig.sectionCardClassName
            )}
          >
            <CardHeader className={cn("space-y-2", uiConfig.sectionHeaderClassName)}>
              <CardTitle className="text-sm leading-tight">{section.title}</CardTitle>
            </CardHeader>
            <CardContent className={cn("grid grid-cols-2 items-start gap-x-1.5 gap-y-1", compactFieldSpacingClass)}>
              {(() => {
                const sortedFields = [...section.fields].sort(
                  (a, b) => getFieldPriority(a, isTransitionOrPhasePage) - getFieldPriority(b, isTransitionOrPhasePage)
                )
                const primaryEndgameClimbFieldId = isEndgamePage ? sortedFields.find(isClimbField)?.id || "" : ""
                const sectionFields = sortedFields.filter((field) => {
                  if (isMiscField(field)) return false
                  if (field.type === "checkbox" && isNonFunctioningLabel(field.label || "")) {
                    return false
                  }
                  if (isEndgamePage && primaryEndgameClimbFieldId && isClimbField(field) && field.id !== primaryEndgameClimbFieldId) {
                    return false
                  }
                  return true
                })
                const sectionUsesDefenseSlider = sectionFields.some(
                  (field) => isStratChoiceField(field) && isPlayingDefenseValue(values[field.id])
                )

                return sectionFields.map((field) => {
                const fieldValue = values[field.id]
                const isRequired = Boolean(field.required)
                const fieldError = errors[field.id]
                const group = normalizeExclusiveGroup(field.exclusiveGroup)
                const activeFieldId = group ? activeExclusiveByGroup[group] : ""
                const isGrayedOut = false
                const activeFieldLabel = activeFieldId ? fieldMap[activeFieldId]?.label || "another field" : ""
                const showMergedClimbControl =
                  isEndgamePage && primaryEndgameClimbFieldId === field.id
                const normalizedClimbField = showMergedClimbControl ? { ...field, label: "Climb?" } : field

              if (showMergedClimbControl) {
                return (
                  <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={normalizedClimbField} isRequired={isRequired} />
                    <SpecialMultipleChoice
                      ariaLabel={normalizedClimbField.label}
                      options={CLIMB_LEVEL_OPTIONS}
                      value={typeof fieldValue === "string" ? fieldValue : ""}
                      onValueChange={(value) => handleValueChange(field.id, value)}
                      allowDeselect={Boolean(field.allowDeselect)}
                      disabled={isGrayedOut}
                    />
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "long_text") {
                const isEndgameNotesField = isEndgamePage && isNotesField(field)
                return (
                  <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <Textarea
                      value={String(fieldValue ?? "")}
                      onChange={(event) => handleValueChange(field.id, event.target.value)}
                      placeholder={field.placeholder || ""}
                      className={cn(
                        "w-full",
                        (isPostMatchPage || isEndgameNotesField) && "min-h-80"
                      )}
                    />
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "select") {
                const selectOptions = withSecondaryDefenseOption(field, field.options || [])
                const isTransitionDefended =
                  isTransitionOrPhasePage && isDefendedField(field)
                const showStatusChecks = !isTransitionDefended && isStatusField(field) && selectOptions.length > 0
                const showPredictionButtons = isPredictionField(field) && hasRedBlueOptions(field)
                const selectedStatuses = Array.isArray(fieldValue)
                  ? fieldValue.filter((value): value is string => typeof value === "string")
                  : typeof fieldValue === "string" && fieldValue
                    ? [fieldValue]
                    : []

                if (showStatusChecks) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} hideDescription />
                      <div className="space-y-1">
                        {selectOptions.map((option) => {
                          const isChecked = selectedStatuses.includes(option)
                          return (
                            <label
                              key={option}
                              className="flex items-center gap-1.5 rounded-xl border border-border/60 px-2 py-1 text-sm leading-tight"
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => handleValueChange(field.id, toggleOptionValue(selectedStatuses, option))}
                                disabled={isGrayedOut}
                              />
                              <span className="font-medium">{splitSpecialChoiceOption(option).title}</span>
                            </label>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (showPredictionButtons) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} hideDescription />
                      <div className="grid grid-cols-2 gap-1">
                        {selectOptions.map((option) => {
                          const isSelected = String(fieldValue ?? "") === option
                          const red = isRedOption(option)
                          const blue = isBlueOption(option)

                          return (
                            <Button
                              key={option}
                              type="button"
                              variant="outline"
                              className={cn(
                                "h-7 rounded-xl px-2 text-sm font-semibold leading-tight",
                                red &&
                                  (isSelected
                                    ? "border-red-700 bg-red-600 text-white hover:bg-red-600"
                                    : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"),
                                blue &&
                                  (isSelected
                                    ? "border-blue-700 bg-blue-600 text-white hover:bg-blue-600"
                                    : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"),
                                !red && !blue && isSelected && "border-primary/80 bg-primary/20 text-white hover:bg-primary/25"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                              disabled={isGrayedOut}
                            >
                              {splitSpecialChoiceOption(option).title}
                            </Button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (isStratChoiceField(field)) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} />
                      <div className="grid grid-cols-2 gap-1">
                        {selectOptions.map((option) => {
                          const isSelected = String(fieldValue ?? "") === option
                          return (
                            <button
                              key={option}
                              type="button"
                              aria-pressed={isSelected}
                              className={cn(
                                "h-6 rounded-xl border px-2 text-sm font-semibold leading-tight text-white touch-manipulation select-none",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                                isSelected
                                  ? "border-primary bg-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                                  : "border-border/70 bg-card hover:bg-muted/30"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                              disabled={isGrayedOut}
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              {splitSpecialChoiceOption(option).title}
                            </button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                return (
                  <div
                    key={field.id}
                    className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}
                  >
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="grid grid-cols-2 gap-1">
                      {(field.options || []).map((option) => {
                        const isSelected = String(fieldValue ?? "") === option
                        return (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={isSelected}
                            className={cn(
                              "h-6 rounded-xl border px-2 text-sm font-semibold leading-tight text-white touch-manipulation select-none",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                              isSelected
                                ? "border-primary bg-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                                : "border-border/70 bg-card hover:bg-muted/30"
                            )}
                            onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                            disabled={isGrayedOut}
                            style={{ WebkitTapHighlightColor: "transparent" }}
                          >
                            {splitSpecialChoiceOption(option).title}
                          </button>
                        )
                      })}
                    </div>
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "radio") {
                if (field.multiSelect) {
                  const selected = Array.isArray(fieldValue) ? (fieldValue as string[]) : []
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} />
                      <div className="grid grid-cols-2 gap-0.5">
                        {(field.options || []).map((option) => (
                          <label key={option} className="flex items-center gap-1 text-xs cursor-pointer leading-tight">
                            <Checkbox
                              checked={selected.includes(option)}
                              onCheckedChange={() => handleToggleOption(field.id, option)}
                              disabled={isGrayedOut}
                            />
                            <span className="font-medium">{option}</span>
                          </label>
                        ))}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }
                const isAutoCollectField = isAutoWhereDidTheyCollectField(field)
                const isAutoStratField = isAutoStrategyField(field)
                const radioOptions = withSecondaryDefenseOption(field, field.options || [])
                const isTransitionDefended =
                  isTransitionOrPhasePage && isDefendedField(field)
                const showStatusChecks = !isTransitionDefended && isStatusField(field) && radioOptions.length > 0
                const showPredictionButtons = isPredictionField(field) && hasRedBlueOptions(field)
                const showStratRole = isStratChoiceField(field)
                const selectedStatuses = Array.isArray(fieldValue)
                  ? fieldValue.filter((value): value is string => typeof value === "string")
                  : typeof fieldValue === "string" && fieldValue
                    ? [fieldValue]
                    : []
                const showTwoColumnRadioGrid =
                  !isAutoStratField &&
                  !showStatusChecks &&
                  !showPredictionButtons &&
                  !showStratRole &&
                  radioOptions.length > 0 &&
                  radioOptions.length <= 4

                if (isAutoCollectField) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} hideDescription />
                      <div className="grid grid-cols-2 gap-1">
                        {(field.options || []).map((option) => {
                          const isSelected = String(fieldValue ?? "") === option
                          return (
                            <Button
                              key={option}
                              type="button"
                              variant="outline"
                              className={cn(
                                "h-5 rounded-xl border px-1 py-0 text-xs font-semibold leading-tight text-white",
                                isSelected
                                  ? "border-primary/80 bg-primary/10"
                                  : "border-border/70 bg-card hover:bg-muted/30"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                              disabled={isGrayedOut}
                            >
                              {option}
                            </Button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (showStatusChecks) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} hideDescription />
                      <div className="space-y-1">
                        {radioOptions.map((option) => {
                          const isChecked = selectedStatuses.includes(option)
                          return (
                            <label
                              key={option}
                              className="flex items-center gap-1.5 rounded-xl border border-border/60 px-2 py-1 text-sm leading-tight"
                            >
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={() => handleValueChange(field.id, toggleOptionValue(selectedStatuses, option))}
                                disabled={isGrayedOut}
                              />
                              <span className="font-medium">{option}</span>
                            </label>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (showPredictionButtons) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} hideDescription />
                      <div className="grid grid-cols-2 gap-1">
                        {radioOptions.map((option) => {
                          const isSelected = String(fieldValue ?? "") === option
                          const red = isRedOption(option)
                          const blue = isBlueOption(option)
                          return (
                            <Button
                              key={option}
                              type="button"
                              variant="outline"
                              className={cn(
                                "h-7 rounded-xl px-2 text-sm font-semibold leading-tight",
                                red &&
                                  (isSelected
                                    ? "border-red-700 bg-red-600 text-white hover:bg-red-600"
                                    : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"),
                                blue &&
                                  (isSelected
                                    ? "border-blue-700 bg-blue-600 text-white hover:bg-blue-600"
                                    : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"),
                                !red && !blue && isSelected && "border-primary/80 bg-primary/20 text-white hover:bg-primary/25"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                              disabled={isGrayedOut}
                            >
                              {option}
                            </Button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (showStratRole) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} />
                      <div className="grid grid-cols-2 gap-1">
                        {radioOptions.map((option) => {
                          const isSelected = String(fieldValue ?? "") === option
                          return (
                            <button
                              key={option}
                              type="button"
                              aria-pressed={isSelected}
                              className={cn(
                                "h-6 rounded-xl border px-2 text-sm font-semibold leading-tight text-white touch-manipulation select-none",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                                isSelected
                                  ? "border-primary bg-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                                  : "border-border/70 bg-card hover:bg-muted/30"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                              disabled={isGrayedOut}
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              {option}
                            </button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (showTwoColumnRadioGrid) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} />
                      <div className="grid grid-cols-2 gap-1">
                        {radioOptions.map((option) => {
                          const isSelected = String(fieldValue ?? "") === option
                          return (
                            <Button
                              key={option}
                              type="button"
                              variant="outline"
                              className={cn(
                                "h-6 px-1.5 py-0.5 text-sm font-medium leading-tight text-white",
                                isSelected
                                  ? "border-primary/80 bg-primary/20 hover:bg-primary/25"
                                  : "border-border/70 bg-card hover:bg-muted/30"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                              disabled={isGrayedOut}
                            >
                              {option}
                            </Button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                return (
                  <div
                    key={field.id}
                    className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}
                  >
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="grid grid-cols-2 gap-1">
                      {(field.options || []).map((option) => {
                        const isSelected = String(fieldValue ?? "") === option
                        return (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={isSelected}
                            className={cn(
                              "h-6 rounded-xl border px-2 text-sm font-semibold leading-tight text-white touch-manipulation select-none",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                              isSelected
                                ? "border-primary bg-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                                : "border-border/70 bg-card hover:bg-muted/30"
                            )}
                            onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option)}
                            disabled={isGrayedOut}
                            style={{ WebkitTapHighlightColor: "transparent" }}
                          >
                            {splitSpecialChoiceOption(option).title}
                          </button>
                        )
                      })}
                    </div>
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "radio_cards") {
                const isMulti = Boolean(field.multiSelect)
                const isAutoCollectField = isAutoWhereDidTheyCollectField(field)
                const isClimbSpecial = isClimbSpecialField(field)
                const isStratChoice = isStratChoiceField(field)
                const parsedOptions = withSecondaryDefenseOption(field, field.options || [])
                  .map((option) => splitSpecialChoiceOption(option))
                  .filter((option) => option.title.length > 0)

                if (!isMulti && isClimbSpecial && parsedOptions.length > 0) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} hideDescription />
                      <SpecialMultipleChoice
                        ariaLabel={field.label}
                        options={parsedOptions.map((option) =>
                          option.description ? `${option.title} | ${option.description}` : option.title
                        )}
                        value={typeof fieldValue === "string" ? fieldValue : ""}
                        onValueChange={(value) => handleValueChange(field.id, value)}
                        allowDeselect={Boolean(field.allowDeselect)}
                        disabled={isGrayedOut}
                      />
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (isAutoCollectField && parsedOptions.length > 0) {
                  const selectedValues = Array.isArray(fieldValue) ? (fieldValue as string[]) : []
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} hideDescription />
                      <div className="grid grid-cols-2 gap-0.5">
                        {parsedOptions.map((option) => {
                          const isSelected = isMulti
                            ? selectedValues.includes(option.value)
                            : String(fieldValue ?? "") === option.value
                          return (
                            <Button
                              key={option.value}
                              type="button"
                              variant="outline"
                              className={cn(
                                "h-5 rounded-xl border px-1 py-0 text-xs font-semibold leading-tight text-white",
                                isSelected
                                  ? "border-primary/80 bg-primary/10"
                                  : "border-border/70 bg-card hover:bg-muted/30"
                              )}
                              onClick={() => {
                                if (isMulti) {
                                  handleToggleOption(field.id, option.value)
                                  return
                                }
                                handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option.value)
                              }}
                              disabled={isGrayedOut}
                            >
                              {option.title}
                            </Button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (!isMulti && isStratChoice && parsedOptions.length > 0) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} />
                      <div className="grid grid-cols-2 gap-1">
                        {parsedOptions.map((option) => {
                          const isSelected = String(fieldValue ?? "") === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={isSelected}
                              className={cn(
                                "h-6 rounded-xl border px-2 text-sm font-semibold leading-tight text-white touch-manipulation select-none",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                                isSelected
                                  ? "border-primary bg-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                                  : "border-border/70 bg-card hover:bg-muted/30"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option.value)}
                              disabled={isGrayedOut}
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              {option.title}
                            </button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                if (!isMulti) {
                  return (
                    <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                      <FieldLabel field={field} isRequired={isRequired} />
                      <div className="grid grid-cols-2 gap-1">
                        {parsedOptions.map((option) => {
                          const isSelected = String(fieldValue ?? "") === option.value
                          return (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={isSelected}
                              className={cn(
                                "h-6 rounded-xl border px-2 text-sm font-semibold leading-tight text-white touch-manipulation select-none",
                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                                isSelected
                                  ? "border-primary bg-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                                  : "border-border/70 bg-card hover:bg-muted/30"
                              )}
                              onClick={() => handleValueChange(field.id, isSelected && field.allowDeselect ? "" : option.value)}
                              disabled={isGrayedOut}
                              style={{ WebkitTapHighlightColor: "transparent" }}
                            >
                              {option.title}
                            </button>
                          )
                        })}
                      </div>
                      {isGrayedOut ? (
                        <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                      ) : null}
                      {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                    </div>
                  )
                }

                return (
                  <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <SpecialMultipleChoice
                      ariaLabel={field.label}
                      options={field.options}
                      multiSelect={isMulti}
                      value={isMulti ? "" : String(fieldValue ?? "")}
                      values={isMulti ? (Array.isArray(fieldValue) ? (fieldValue as string[]) : []) : undefined}
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
                )
              }

              if (field.type === "multi_select") {
                const selected = Array.isArray(fieldValue) ? (fieldValue as string[]) : []
                return (
                  <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="grid grid-cols-2 gap-1">
                      {(field.options || []).map((option) => (
                        <label key={option} className="flex items-center gap-1 text-xs leading-tight">
                          <Checkbox
                            checked={selected.includes(option)}
                            onCheckedChange={() => handleToggleOption(field.id, option)}
                          />
                          <span className="font-medium">{option}</span>
                        </label>
                      ))}
                    </div>
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "checkbox") {
                const isAllianceWonFull = isTransitionPage && isAllianceWonAutoField(field)
                const isStatusCheckbox = isStatusField(field)
                const isTransitionDefended =
                  isTransitionOrPhasePage && isDefendedField(field)
                return (
                  <div
                    key={field.id}
                    className={cn(
                      "space-y-1",
                      (isAllianceWonFull || (isStatusCheckbox && !isTransitionDefended)) && "col-span-2",
                      isGrayedOut && "opacity-50"
                    )}
                  >
                    <label className="flex items-center gap-1 text-sm leading-tight">
                      <Checkbox
                        checked={Boolean(fieldValue)}
                        onCheckedChange={(value) => handleValueChange(field.id, Boolean(value))}
                      />
                      <span className="font-medium">
                        {field.label} {isRequired ? "*" : ""}
                      </span>
                      {field.helpText ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
                              aria-label={`${field.label} description`}
                            >
                              <CircleHelp className="h-3.5 w-3.5" />
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
                )
              }

              if (field.type === "image") {
                return (
                  <div key={field.id} className={cn("col-span-2 space-y-1", isGrayedOut && "opacity-50")}>
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button variant="outline" type="button" className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          className="absolute inset-0 cursor-pointer opacity-0"
                          onChange={(event) => {
                            const file = event.target.files?.[0]
                            handleImageUpload(field.id, file)
                            event.target.value = ""
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
                          className="w-full max-h-40 object-contain"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              const showDefenseSlider =
                sectionUsesDefenseSlider &&
                field.type === "number" &&
                hasEstimateOrRatingValue(field)
              const displayField =
                showDefenseSlider && hasEstimateOrRatingValue(field)
                  ? { ...field, label: "Defense Rating" }
                  : field

              if (
                field.type === "number" &&
                Array.isArray(field.stepperButtons) &&
                field.stepperButtons.length > 0 &&
                !showDefenseSlider
              ) {
                const min = field.min ?? 0
                const max = typeof field.max === "number" ? field.max : undefined
                const step = field.step ?? 1
                const numericValue = toFiniteNumber(fieldValue, min)
                return (
                  <div
                    key={field.id}
                    className={cn("space-y-1", isWideRatingField(field) && "col-span-2", isGrayedOut && "opacity-50")}
                  >
                    <FieldLabel field={field} isRequired={isRequired} />
                    <NumberStepper
                      value={numericValue}
                      onChange={(value) => handleValueChange(field.id, value)}
                      adjustments={field.stepperButtons}
                      min={min}
                      max={max}
                      step={step}
                      disabled={isGrayedOut}
                    />
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "slider" || showDefenseSlider) {
                const min = showDefenseSlider ? 1 : field.min ?? 0
                const max = showDefenseSlider ? 10 : field.max ?? 5
                const step = 1
                const numericValue = Math.min(max, Math.max(min, toFiniteNumber(fieldValue, min)))
                const isFullWidthSlider =
                  showDefenseSlider || isWideRatingField(field) || isTransitionOrPhasePage
                return (
                  <div
                    key={field.id}
                    className={cn("space-y-1", isFullWidthSlider && "col-span-2", isGrayedOut && "opacity-50")}
                  >
                    <FieldLabel field={displayField} isRequired={isRequired} />
                    <div className="space-y-1">
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={numericValue}
                        onChange={(event) => handleValueChange(field.id, Number(event.target.value))}
                        className={cn("w-full", showDefenseSlider && "defense-rating-slider")}
                        style={{ touchAction: "none" }}
                        onTouchStart={(e) => e.stopPropagation()}
                        onTouchMove={(e) => e.stopPropagation()}
                      />
                      <div className="text-right text-xs font-medium">{numericValue}</div>
                    </div>
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              if (field.type === "rating") {
                const min = field.min ?? 0
                const max = field.max ?? 5
                const options = Array.from({ length: max - min + 1 }, (_, idx) => String(min + idx))
                return (
                  <div
                    key={field.id}
                    className={cn("space-y-1", isWideRatingField(field) && "col-span-2", isGrayedOut && "opacity-50")}
                  >
                    <FieldLabel field={field} isRequired={isRequired} />
                    <div className="flex gap-1">
                      {options.map((option) => {
                        const isSelected = String(fieldValue ?? "") === option
                        return (
                          <button
                            key={option}
                            type="button"
                            aria-pressed={isSelected}
                            className={cn(
                              "flex-1 h-6 rounded-xl border text-sm font-semibold leading-tight text-white touch-manipulation select-none",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                              isSelected
                                ? "border-primary bg-primary/35 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-primary)_60%,transparent)]"
                                : "border-border/70 bg-card hover:bg-muted/30"
                            )}
                            onClick={() => handleValueChange(field.id, isSelected ? "" : option)}
                            disabled={isGrayedOut}
                            style={{ WebkitTapHighlightColor: "transparent" }}
                          >
                            {option}
                          </button>
                        )
                      })}
                    </div>
                    {isGrayedOut ? (
                      <p className="text-xs text-muted-foreground">Mutual exclusion active: {activeFieldLabel}</p>
                    ) : null}
                    {fieldError ? <p className="text-xs text-destructive">{fieldError}</p> : null}
                  </div>
                )
              }

              const inputType =
                field.type === "number"
                  ? "number"
                  : field.type === "date"
                    ? "date"
                    : field.type === "time"
                      ? "time"
                      : "text"

              return (
                <div
                  key={field.id}
                  className={cn("space-y-1", isWideRatingField(field) && "col-span-2", isGrayedOut && "opacity-50")}
                >
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
              )
                })
              })()}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className={cn("flex flex-wrap items-center gap-2", isPaged ? "justify-between" : "justify-end")}>
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
        <div className="flex items-center gap-2">
          {isPaged && pageIndex < displayPageCount - 1 && !didNotShowActive ? (
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
  )
}
