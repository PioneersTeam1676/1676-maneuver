import type { FormField, FormPage, FormSection, FormType } from "@/types/formBuilder"

export type FormTemplate = {
  id: string
  label: string
  description: string
  type: FormType
  build: (createId: () => string) => {
    pages: FormPage[]
    name?: string
    description?: string
  }
}

const makeField = (
  createId: () => string,
  field: Omit<FormField, "id">
): FormField => ({
  id: createId(),
  ...field,
})

const makeSection = (
  createId: () => string,
  section: Omit<FormSection, "id">
): FormSection => ({
  id: createId(),
  ...section,
})

const makePage = (
  createId: () => string,
  page: Omit<FormPage, "id">
): FormPage => ({
  id: createId(),
  ...page,
})

export const DRIVE_FORM_TEMPLATES: FormTemplate[] = [
  {
    id: "drive_quick_snapshot",
    label: "Quick Drive Snapshot",
    description: "Fast, match-to-match pulse check with ratings and notes.",
    type: "drive",
    build: (createId) => ({
      name: "Drive Team Snapshot",
      description: "Quick pass on drive team performance and communication.",
      pages: [
        makePage(createId, {
          title: "Match Snapshot",
          description: "Capture the essentials before the match ends.",
          sections: [
            makeSection(createId, {
              title: "Identifiers",
              description: "Who and what you are observing.",
              imageUrl: "",
              fields: [
                makeField(createId, {
                  type: "number",
                  label: "Match Number",
                  key: "match_number",
                  required: true,
                  min: 1,
                  max: 200,
                  step: 1,
                }),
                makeField(createId, {
                  type: "number",
                  label: "Team Number",
                  key: "team_number",
                  required: true,
                  min: 1,
                  max: 9999,
                  step: 1,
                }),
                makeField(createId, {
                  type: "select",
                  label: "Alliance",
                  key: "alliance",
                  options: ["Red", "Blue"],
                }),
                makeField(createId, {
                  type: "select",
                  label: "Primary Role",
                  key: "primary_role",
                  options: [
                    "Primary scorer",
                    "Secondary scorer",
                    "Defense",
                    "Support",
                    "Specialist",
                  ],
                }),
              ],
            }),
            makeSection(createId, {
              title: "Strategy Tags",
              description: "Quick call-outs on how they played this match.",
              imageUrl: "",
              fields: [
                makeField(createId, {
                  type: "multi_select",
                  label: "Observed Strategy",
                  key: "strategy_tags",
                  options: [
                    "Fast cycling",
                    "Defense",
                    "Feeding",
                    "Endgame focus",
                    "Disruption / blocking",
                    "Assist / setup",
                  ],
                }),
              ],
            }),
          ],
        }),
        makePage(createId, {
          title: "Performance Pulse",
          description: "Ratings and notes while it is fresh.",
          sections: [
            makeSection(createId, {
              title: "Driving & Execution",
              description: "",
              imageUrl: "",
              fields: [
                makeField(createId, {
                  type: "rating",
                  label: "Drive Control",
                  helpText: "Smoothness, precision, and avoidance of contact.",
                  key: "drive_control",
                  min: 1,
                  max: 5,
                  step: 1,
                  required: true,
                }),
                makeField(createId, {
                  type: "rating",
                  label: "Cycle Speed",
                  helpText: "Pace of scoring or game piece movement.",
                  key: "cycle_speed",
                  min: 1,
                  max: 5,
                  step: 1,
                }),
                makeField(createId, {
                  type: "rating",
                  label: "Defense Handling",
                  helpText: "How well they absorb or avoid defense.",
                  key: "defense_handling",
                  min: 1,
                  max: 5,
                  step: 1,
                }),
              ],
            }),
            makeSection(createId, {
              title: "Comms & Conduct",
              description: "",
              imageUrl: "",
              fields: [
                makeField(createId, {
                  type: "rating",
                  label: "Communication",
                  helpText: "Callouts, coordination, and calm under pressure.",
                  key: "communication",
                  min: 1,
                  max: 5,
                  step: 1,
                }),
                makeField(createId, {
                  type: "rating",
                  label: "Gracious Professionalism",
                  helpText: "Respect toward refs, volunteers, and partners.",
                  key: "gracious_professionalism",
                  min: 1,
                  max: 5,
                  step: 1,
                  required: true,
                }),
                makeField(createId, {
                  type: "long_text",
                  label: "Highlights / concerns",
                  key: "notes",
                  placeholder: "Clutch plays, mistakes, or trends.",
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  },
  {
    id: "drive_full_debrief",
    label: "Full Drive Debrief",
    description: "Multi-page breakdown of skill, strategy, and alliance fit.",
    type: "drive",
    build: (createId) => ({
      name: "Drive Team Debrief",
      description: "Deeper review of drive team execution and conduct.",
      pages: [
        makePage(createId, {
          title: "Match Context",
          description: "Frame the match and role quickly.",
          sections: [
            makeSection(createId, {
              title: "Identifiers",
              description: "",
              imageUrl: "",
              fields: [
                makeField(createId, {
                  type: "number",
                  label: "Match Number",
                  key: "match_number",
                  required: true,
                  min: 1,
                  max: 200,
                  step: 1,
                }),
                makeField(createId, {
                  type: "number",
                  label: "Team Number",
                  key: "team_number",
                  required: true,
                  min: 1,
                  max: 9999,
                  step: 1,
                }),
                makeField(createId, {
                  type: "select",
                  label: "Alliance",
                  key: "alliance",
                  options: ["Red", "Blue"],
                }),
                makeField(createId, {
                  type: "select",
                  label: "Starting Position",
                  key: "starting_position",
                  options: ["Left", "Center", "Right", "Unknown"],
                }),
              ],
            }),
            makeSection(createId, {
              title: "Role & Strategy",
              description: "",
              imageUrl: "",
              fields: [
                makeField(createId, {
                  type: "select",
                  label: "Primary Role",
                  key: "primary_role",
                  options: [
                    "Primary scorer",
                    "Secondary scorer",
                    "Defense",
                    "Support",
                    "Specialist",
                  ],
                }),
                makeField(createId, {
                  type: "multi_select",
                  label: "Strategy Tags",
                  key: "strategy_tags",
                  options: [
                    "Fast cycling",
                    "Defense",
                    "Feeding",
                    "Endgame focus",
                    "Disruption / blocking",
                    "Assist / setup",
                    "High risk",
                  ],
                }),
                makeField(createId, {
                  type: "checkbox",
                  label: "Led alliance strategy call",
                  key: "led_strategy_call",
                }),
              ],
            }),
          ],
        }),
        makePage(createId, {
          title: "Execution",
          description: "Detailed ratings on execution and awareness.",
          sections: [
            makeSection(createId, {
              title: "Driving & Controls",
              description: "",
              imageUrl: "",
              fields: [
                makeField(createId, {
                  type: "rating",
                  label: "Drive Control",
                  helpText: "Precision, smoothness, and avoidance of errors.",
                  key: "drive_control",
                  min: 1,
                  max: 5,
                  step: 1,
                  required: true,
                }),
                makeField(createId, {
                  type: "rating",
                  label: "Cycle Speed",
                  helpText: "How quickly they complete scoring cycles.",
                  key: "cycle_speed",
                  min: 1,
                  max: 5,
                  step: 1,
                }),
                makeField(createId, {
                  type: "rating",
                  label: "Defense Handling",
                  helpText: "Ability to absorb or avoid defense.",
                  key: "defense_handling",
                  min: 1,
                  max: 5,
                  step: 1,
                }),
              ],
            }),
            makeSection(createId, {
              title: "Field Awareness",
              description: "",
              imageUrl: "",
              fields: [
                makeField(createId, {
                  type: "rating",
                  label: "Field Awareness",
                  helpText: "Adapts to match flow and avoids penalties.",
                  key: "field_awareness",
                  min: 1,
                  max: 5,
                  step: 1,
                }),
                makeField(createId, {
                  type: "rating",
                  label: "Decision Making",
                  helpText: "Smart choices under pressure.",
                  key: "decision_making",
                  min: 1,
                  max: 5,
                  step: 1,
                }),
                makeField(createId, {
                  type: "rating",
                  label: "Clutch Factor",
                  helpText: "Performance in key moments.",
                  key: "clutch_factor",
                  min: 1,
                  max: 5,
                  step: 1,
                }),
              ],
            }),
          ],
        }),
        makePage(createId, {
          title: "Teamwork & Notes",
          description: "Alliance fit, conduct, and supporting media.",
          sections: [
            makeSection(createId, {
              title: "Alliance Fit",
              description: "",
              imageUrl: "",
              fields: [
                makeField(createId, {
                  type: "rating",
                  label: "Alliance Cooperation",
                  helpText: "Coordination and willingness to adapt.",
                  key: "alliance_cooperation",
                  min: 1,
                  max: 5,
                  step: 1,
                }),
                makeField(createId, {
                  type: "rating",
                  label: "Human Player Performance",
                  helpText: "Speed and accuracy of human player actions.",
                  key: "human_player_rating",
                  min: 1,
                  max: 5,
                  step: 1,
                }),
                makeField(createId, {
                  type: "checkbox",
                  label: "Positive alliance comms",
                  key: "positive_comms",
                }),
              ],
            }),
            makeSection(createId, {
              title: "Conduct & Notes",
              description: "",
              imageUrl: "",
              fields: [
                makeField(createId, {
                  type: "rating",
                  label: "Gracious Professionalism",
                  helpText: "Respect toward refs, volunteers, and partners.",
                  key: "gracious_professionalism",
                  min: 1,
                  max: 5,
                  step: 1,
                  required: true,
                }),
                makeField(createId, {
                  type: "select",
                  label: "Reaction to Adversity",
                  key: "adversity_reaction",
                  options: [
                    "Calm / focused",
                    "Encouraging",
                    "Frustrated",
                    "Aggressive / blaming",
                    "Gave up",
                  ],
                }),
                makeField(createId, {
                  type: "long_text",
                  label: "Detailed Notes",
                  key: "notes",
                  placeholder: "Specific plays, issues, or coaching notes.",
                }),
                makeField(createId, {
                  type: "image",
                  label: "Drive Team Photo",
                  key: "drive_team_photo",
                  helpText: "Optional photo of drive team setup.",
                }),
              ],
            }),
          ],
        }),
      ],
    }),
  },
]
