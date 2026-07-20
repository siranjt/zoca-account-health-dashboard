import "server-only";
import { queryAurora } from "@/lib/metabase";

// Prompt catalog from prompts.prompts (the Retool "Select Prompt" widget:
// query3 function / query4 use_case / query5 prompt text). 168 current
// prompts across function → type → use_case, each combo one prompt.

export interface PromptMeta {
  function: string;
  type: string;
  useCase: string;
}

const esc = (s: string) => String(s ?? "").replace(/'/g, "''");

export async function getPromptCatalog(): Promise<PromptMeta[]> {
  const rows = await queryAurora(
    `SELECT function::text f, type::text t, use_case u
     FROM prompts.prompts
     WHERE is_current=true AND prompt IS NOT NULL AND length(prompt)>0
     ORDER BY 1,2,3`
  );
  return rows.map((r) => ({ function: String(r.f ?? ""), type: String(r.t ?? ""), useCase: String(r.u ?? "") }));
}

export async function getPromptText(fn: string, type: string, useCase: string): Promise<string | null> {
  const rows = await queryAurora(
    `SELECT prompt FROM prompts.prompts
     WHERE is_current=true AND function::text='${esc(fn)}' AND type::text='${esc(type)}' AND use_case='${esc(useCase)}'
       AND prompt IS NOT NULL
     ORDER BY updated_at DESC NULLS LAST LIMIT 1`
  );
  return rows[0]?.prompt ? String(rows[0].prompt) : null;
}
