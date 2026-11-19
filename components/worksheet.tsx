"use client";

import { Input, Select, TextArea } from "@/components/ui";

export type FieldDef = {
  key: string;
  label: string;
  type: "short" | "long" | "number" | "choice" | "table";
  help?: string;
  optional?: boolean;
  choices?: string[];
  columns?: string[];
  rows?: string[];
  rowCount?: number;
};

/** Renders worksheet or assessment questions, either to fill in or to read. */
export function QuestionSet({
  fields,
  values,
  onChange,
  readOnly,
}: {
  fields: FieldDef[];
  values: Record<string, string>;
  onChange?: (key: string, value: string) => void;
  readOnly?: boolean;
}) {
  const set = (key: string) => (e: { target: { value: string } }) => onChange?.(key, e.target.value);
  return (
    <div className="space-y-5">
      {fields.map((f) => (
        <div key={f.key}>
          <div className="mb-1.5 text-sm font-medium text-ink">
            {f.label}
            {f.optional && <span className="ml-1.5 font-normal text-faint">Optional</span>}
          </div>
          {f.help && <p className="mb-1.5 text-[13px] text-soft">{f.help}</p>}
          {f.type === "table" ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] border-collapse text-sm">
                <thead>
                  <tr>
                    {f.rows && <th className="w-36 border border-line bg-mist px-2 py-1.5 text-left font-medium" />}
                    {(f.columns ?? []).map((c) => (
                      <th key={c} className="border border-line bg-mist px-2 py-1.5 text-left font-medium">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: f.rows ? f.rows.length : (f.rowCount ?? 3) }).map((_, r) => (
                    <tr key={r}>
                      {f.rows && <th className="border border-line bg-mist px-2 py-1.5 text-left font-medium">{f.rows[r]}</th>}
                      {(f.columns ?? []).map((c, ci) => {
                        const key = `${f.key}.${r}.${ci}`;
                        return (
                          <td key={ci} className="border border-line p-0 align-top">
                            {readOnly ? (
                              <div className="min-h-9 whitespace-pre-wrap px-2 py-1.5">{values[key] ?? ""}</div>
                            ) : (
                              <textarea
                                rows={1}
                                value={values[key] ?? ""}
                                onChange={set(key)}
                                maxLength={4000}
                                aria-label={`${f.rows ? f.rows[r] + ", " : ""}${c}`}
                                className="block min-h-9 w-full resize-none bg-transparent px-2 py-1.5 focus:bg-gold-50 focus:outline-none"
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : readOnly ? (
            <div className="whitespace-pre-wrap rounded-md bg-mist px-3 py-2 text-sm">{values[f.key] || <span className="text-faint">No answer yet</span>}</div>
          ) : f.type === "choice" ? (
            <Select value={values[f.key] ?? ""} onChange={set(f.key)}>
              <option value="">Choose one</option>
              {(f.choices ?? []).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          ) : f.type === "long" ? (
            <TextArea value={values[f.key] ?? ""} onChange={set(f.key)} maxLength={4000} />
          ) : (
            <Input type={f.type === "number" ? "number" : "text"} value={values[f.key] ?? ""} onChange={set(f.key)} maxLength={4000} />
          )}
        </div>
      ))}
    </div>
  );
}
