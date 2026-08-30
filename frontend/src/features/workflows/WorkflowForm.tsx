import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, GitBranch, Radio, Send } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert } from "../../components/Alert";
import { Button } from "../../components/Button";
import { Input, Select, Textarea } from "../../components/FormField";
import type { Workflow, WorkflowInput } from "../../types/workflow";
import { conditionOperators } from "../../types/workflow";
import {
  makeWorkflowFormSchema,
  toWorkflowInput,
  workflowFormDefaults,
  type WorkflowFormValues,
} from "./workflowFormSchema";

const steps = [
  { label: "Basics", icon: Radio },
  { label: "Condition", icon: GitBranch },
  { label: "Action", icon: Send },
  { label: "Review", icon: Check },
];

const operatorLabels: Record<(typeof conditionOperators)[number], string> = {
  equals: "Equals",
  not_equals: "Does not equal",
  contains: "Contains",
  greater_than: "Greater than",
  greater_than_or_equal: "Greater than or equal",
  less_than: "Less than",
  less_than_or_equal: "Less than or equal",
  exists: "Exists",
  does_not_exist: "Does not exist",
};

function StepPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={`step-${title.toLowerCase()}`}>
      <h2 id={`step-${title.toLowerCase()}`} className="text-lg font-semibold text-white">
        {title}
      </h2>
      <p className="mt-1.5 text-sm leading-6 text-slate-400">{description}</p>
      <div className="mt-7">{children}</div>
    </section>
  );
}

export function WorkflowForm({
  workflow,
  onSubmit,
  submitLabel,
  error,
}: {
  workflow?: Workflow;
  onSubmit: (input: WorkflowInput) => Promise<void>;
  submitLabel: string;
  error?: string | null;
}) {
  const [step, setStep] = useState(0);
  const schema = useMemo(
    () => makeWorkflowFormSchema(workflow?.action.action_type),
    [workflow?.action.action_type],
  );
  const defaults = useMemo(() => workflowFormDefaults(workflow), [workflow]);
  const {
    register,
    handleSubmit,
    trigger,
    control,
    formState: { errors, isSubmitting },
  } = useForm<WorkflowFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
    mode: "onTouched",
  });
  const values = useWatch({ control, defaultValue: defaults }) as WorkflowFormValues;
  const needsComparison = !["exists", "does_not_exist"].includes(values.operator);

  const next = async () => {
    let fields: Array<keyof WorkflowFormValues> = [];
    if (step === 0) fields = ["name", "description"];
    if (step === 1 && values.hasCondition) fields = ["fieldPath", "operator", "comparisonValue"];
    if (step === 2)
      fields =
        values.actionType === "HTTP_POST"
          ? ["actionType", "targetUrl", "headersJson", "timeoutSeconds"]
          : ["actionType", "discordWebhookUrl", "messageTemplate"];
    if (!fields.length || (await trigger(fields))) setStep((current) => Math.min(current + 1, 3));
  };

  return (
    <form
      onSubmit={(event) =>
        void handleSubmit((formValues) => onSubmit(toWorkflowInput(formValues)))(event)
      }
      noValidate
    >
      <ol className="mb-8 grid grid-cols-4 gap-2" aria-label="Workflow creation steps">
        {steps.map(({ label, icon: Icon }, index) => (
          <li
            key={label}
            className={`rounded-lg border px-2 py-3 text-center text-xs font-medium sm:flex sm:items-center sm:gap-2 sm:px-3 sm:text-left ${index === step ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200" : index < step ? "border-slate-700 bg-slate-800/60 text-slate-300" : "border-slate-800 text-slate-500"}`}
            aria-current={index === step ? "step" : undefined}
          >
            <Icon className="mx-auto mb-1 size-4 sm:m-0" aria-hidden="true" />
            <span>{label}</span>
          </li>
        ))}
      </ol>

      {error ? (
        <div className="mb-6">
          <Alert>{error}</Alert>
        </div>
      ) : null}

      <div className="min-h-[23rem] rounded-xl border border-slate-800 bg-slate-900/55 p-5 sm:p-7">
        {step === 0 ? (
          <StepPanel
            title="Workflow basics"
            description="Give this automation a name your future self will recognise."
          >
            <div className="space-y-5">
              <Input
                label="Name"
                placeholder="High-value lead"
                autoFocus
                error={errors.name?.message}
                {...register("name")}
              />
              <Textarea
                label="Description"
                optional
                placeholder="Notify sales when a valuable lead arrives."
                error={errors.description?.message}
                {...register("description")}
              />
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700 bg-slate-950/40 p-4">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 rounded border-slate-600 bg-slate-900 accent-emerald-400"
                  {...register("isEnabled")}
                />
                <span>
                  <span className="block text-sm font-medium text-slate-200">
                    Enable immediately
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">
                    Enabled workflows accept incoming webhook events as soon as they are created.
                  </span>
                </span>
              </label>
            </div>
          </StepPanel>
        ) : null}

        {step === 1 ? (
          <StepPanel
            title="Optional condition"
            description="Continue only when one safe comparison matches the incoming JSON payload."
          >
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-700 bg-slate-950/40 p-4">
              <input
                type="checkbox"
                className="mt-0.5 size-4 rounded border-slate-600 bg-slate-900 accent-emerald-400"
                {...register("hasCondition")}
              />
              <span>
                <span className="block text-sm font-medium text-slate-200">Add a condition</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Events that do not match are recorded as skipped.
                </span>
              </span>
            </label>
            {values.hasCondition ? (
              <div className="mt-6 grid gap-5 sm:grid-cols-2">
                <Input
                  label="JSON field path"
                  placeholder="lead.value"
                  hint="Dot-separated object keys only."
                  error={errors.fieldPath?.message}
                  {...register("fieldPath")}
                />
                <Select label="Operator" error={errors.operator?.message} {...register("operator")}>
                  {conditionOperators.map((operator) => (
                    <option key={operator} value={operator}>
                      {operatorLabels[operator]}
                    </option>
                  ))}
                </Select>
                {needsComparison ? (
                  <div className="sm:col-span-2">
                    <Input
                      label="Comparison value"
                      placeholder={
                        values.operator.includes("greater") || values.operator.includes("less")
                          ? "1000"
                          : "approved"
                      }
                      hint={
                        'Use JSON quotes for numeric-looking text ("123") or an empty string (""); arrays are supported for contains.'
                      }
                      error={errors.comparisonValue?.message}
                      {...register("comparisonValue")}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
          </StepPanel>
        ) : null}

        {step === 2 ? (
          <StepPanel
            title="Delivery action"
            description="Choose the single destination AutoRelay will call after the condition passes."
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {(["HTTP_POST", "DISCORD_WEBHOOK"] as const).map((type) => (
                <label
                  key={type}
                  className={`cursor-pointer rounded-lg border p-4 transition ${values.actionType === type ? "border-sky-400/45 bg-sky-400/10" : "border-slate-700 bg-slate-950/30 hover:border-slate-600"}`}
                >
                  <input
                    type="radio"
                    value={type}
                    className="sr-only"
                    {...register("actionType")}
                  />
                  <span className="block text-sm font-semibold text-slate-100">
                    {type === "HTTP_POST" ? "HTTP POST" : "Discord webhook"}
                  </span>
                  <span className="mt-1.5 block text-xs leading-5 text-slate-500">
                    {type === "HTTP_POST"
                      ? "Forward the original JSON to an HTTP endpoint."
                      : "Render a safe message and post it to Discord."}
                  </span>
                </label>
              ))}
            </div>
            {values.actionType === "HTTP_POST" ? (
              <div className="mt-6 space-y-5">
                <Input
                  label="Target URL"
                  placeholder={
                    workflow
                      ? "Leave empty to preserve the current URL"
                      : "https://example.com/events"
                  }
                  hint={
                    workflow
                      ? "Leave empty to preserve an encrypted value that is not displayed."
                      : "Public HTTP and HTTPS destinations only; private network targets are blocked by the API."
                  }
                  error={errors.targetUrl?.message}
                  {...register("targetUrl")}
                />
                <Textarea
                  label="Custom headers"
                  optional
                  className="font-mono text-xs"
                  placeholder={'{\n  "X-Source": "AutoRelay"\n}'}
                  hint="JSON object with string values. Sensitive values are not displayed again."
                  error={errors.headersJson?.message}
                  {...register("headersJson")}
                />
                <Input
                  label="Request timeout (seconds)"
                  type="number"
                  min={1}
                  max={30}
                  error={errors.timeoutSeconds?.message}
                  {...register("timeoutSeconds", { valueAsNumber: true })}
                />
              </div>
            ) : (
              <div className="mt-6 space-y-5">
                <Input
                  label="Discord webhook URL"
                  type="url"
                  placeholder={
                    workflow
                      ? "Leave empty to preserve the current webhook"
                      : "https://discord.com/api/webhooks/…"
                  }
                  hint={
                    workflow
                      ? "Leave empty to preserve the encrypted webhook URL."
                      : "Only recognised Discord webhook hosts and paths are accepted."
                  }
                  error={errors.discordWebhookUrl?.message}
                  {...register("discordWebhookUrl")}
                />
                <Textarea
                  label="Message template"
                  placeholder="New lead: {{lead.name}} ({{lead.value}})"
                  hint="Use simple {{dot.path}} placeholders from the incoming payload."
                  error={errors.messageTemplate?.message}
                  {...register("messageTemplate")}
                />
              </div>
            )}
          </StepPanel>
        ) : null}

        {step === 3 ? (
          <StepPanel
            title="Review workflow"
            description="Check the shape of the automation before saving it."
          >
            <dl className="divide-y divide-slate-800 rounded-lg border border-slate-800 bg-slate-950/35">
              <ReviewRow label="Name" value={values.name || "Not set"} />
              <ReviewRow label="Status" value={values.isEnabled ? "Enabled" : "Disabled"} />
              <ReviewRow
                label="Condition"
                value={
                  values.hasCondition
                    ? `${values.fieldPath} ${operatorLabels[values.operator].toLowerCase()}${needsComparison ? ` ${values.comparisonValue}` : ""}`
                    : "Always run"
                }
              />
              <ReviewRow
                label="Action"
                value={
                  values.actionType === "HTTP_POST"
                    ? `HTTP POST · ${values.targetUrl || "existing protected URL"}`
                    : `Discord webhook · ${values.discordWebhookUrl ? "configured" : "existing protected URL"}`
                }
              />
            </dl>
            <p className="mt-5 text-xs leading-5 text-slate-500">
              The API validates destinations, protects private network targets, and remains the
              source of truth for this configuration.
            </p>
          </StepPanel>
        ) : null}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={step === 0 || isSubmitting}
          onClick={() => setStep((current) => Math.max(current - 1, 0))}
        >
          <ArrowLeft className="size-4" aria-hidden="true" /> Back
        </Button>
        {step < 3 ? (
          <Button
            key="continue"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              void next();
            }}
          >
            Continue <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button key="submit" type="submit" busy={isSubmitting}>
            {submitLabel} <Check className="size-4" aria-hidden="true" />
          </Button>
        )}
      </div>
    </form>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[8rem_1fr]">
      <dt className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className="break-words text-sm text-slate-200">{value}</dd>
    </div>
  );
}
