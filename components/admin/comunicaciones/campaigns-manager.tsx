"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Plus, Send, Trash2, TriangleAlert, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/admin/toast";
import { AUDIENCE_STATUSES } from "@/lib/campaigns/audience";

type Campaign = {
  id: string;
  program_id: string;
  cohort_id: string | null;
  subject: string;
  preheader: string | null;
  body_md: string;
  cta_label: string | null;
  cta_url: string | null;
  audience_status: string[];
  audience_segment: string | null;
  status: string;
  recipients_count: number;
  sent_count: number;
  error: string | null;
  sent_at: string | null;
  created_at: string;
  cohorts?: { name: string } | null;
};

type Props = {
  programs: { id: string; name: string }[];
  cohorts: { id: string; name: string; program_id: string }[];
  initialProgramId?: string;
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  sending: "Enviando",
  sent: "Enviada",
  failed: "Con fallos",
};

const STATUS_TONE: Record<string, "neutral" | "violet" | "lime" | "destructive"> = {
  draft: "neutral",
  sending: "violet",
  sent: "lime",
  failed: "destructive",
};

const ENROLLMENT_LABEL: Record<string, string> = {
  active: "Activas",
  invited: "Invitadas",
  completed: "Completadas",
  suspended: "Suspendidas",
};

type DraftState = {
  cohortId: string;
  subject: string;
  preheader: string;
  bodyMd: string;
  ctaLabel: string;
  ctaUrl: string;
  audienceStatus: string[];
};

const EMPTY_DRAFT: DraftState = {
  cohortId: "",
  subject: "",
  preheader: "",
  bodyMd: "",
  ctaLabel: "",
  ctaUrl: "",
  audienceStatus: ["active"],
};

export function CampaignsManager({ programs, cohorts, initialProgramId }: Props) {
  const { toast, ToastContainer } = useToast();

  const [programId, setProgramId] = useState(initialProgramId ?? programs[0]?.id ?? "");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const [confirmSend, setConfirmSend] = useState<Campaign | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);

  const programCohorts = useMemo(
    () => cohorts.filter((c) => c.program_id === programId),
    [cohorts, programId],
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!programId) return;
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/admin/campaigns?programId=${programId}`, { signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Error al cargar");
        setCampaigns(data.campaigns ?? []);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setLoadError((err as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [programId],
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Conteo de audiencia en vivo: es la última barrera antes de un envío masivo,
  // así que se recalcula ante cualquier cambio de segmentación.
  useEffect(() => {
    if (!editorOpen || !programId) return;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAudienceLoading(true);
    const params = new URLSearchParams({ programId, status: draft.audienceStatus.join(",") });
    if (draft.cohortId) params.set("cohortId", draft.cohortId);

    fetch(`/api/admin/campaigns/audience?${params}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => setAudienceCount(typeof d.count === "number" ? d.count : null))
      .catch(() => setAudienceCount(null))
      .finally(() => setAudienceLoading(false));

    return () => controller.abort();
  }, [editorOpen, programId, draft.cohortId, draft.audienceStatus]);

  function openNew() {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setAudienceCount(null);
    setEditorOpen(true);
  }

  function openEdit(campaign: Campaign) {
    setEditingId(campaign.id);
    setDraft({
      cohortId: campaign.cohort_id ?? "",
      subject: campaign.subject,
      preheader: campaign.preheader ?? "",
      bodyMd: campaign.body_md,
      ctaLabel: campaign.cta_label ?? "",
      ctaUrl: campaign.cta_url ?? "",
      audienceStatus: campaign.audience_status ?? ["active"],
    });
    setAudienceCount(null);
    setEditorOpen(true);
  }

  function toggleStatus(status: string) {
    setDraft((d) => {
      const next = d.audienceStatus.includes(status)
        ? d.audienceStatus.filter((s) => s !== status)
        : [...d.audienceStatus, status];
      // Nunca dejar la audiencia sin ningún estado: enviaría a cero personas.
      return { ...d, audienceStatus: next.length ? next : d.audienceStatus };
    });
  }

  async function save(): Promise<string | null> {
    const payload = {
      programId,
      cohortId: draft.cohortId || null,
      subject: draft.subject.trim(),
      preheader: draft.preheader.trim() || null,
      bodyMd: draft.bodyMd.trim(),
      ctaLabel: draft.ctaLabel.trim() || null,
      ctaUrl: draft.ctaUrl.trim() || null,
      audienceStatus: draft.audienceStatus,
    };

    setSaving(true);
    try {
      const res = await fetch(
        editingId ? `/api/admin/campaigns/${editingId}` : "/api/admin/campaigns",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingId ? { ...payload, programId: undefined } : payload),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error ?? "No se pudo guardar", "error");
        return null;
      }
      await load();
      return data.campaign?.id ?? editingId;
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    const id = await save();
    if (id) {
      toast(editingId ? "Comunicado actualizado" : "Borrador guardado", "success");
      setEditorOpen(false);
    }
  }

  async function handleTest() {
    // Guardar primero: la prueba renderiza lo que está en la base, no lo que
    // está en pantalla, así que un borrador sin guardar enviaría la versión vieja.
    const id = await save();
    if (!id) return;
    setEditingId(id);
    setTesting(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${id}/test`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      toast(
        res.ok ? `Prueba enviada a ${data.to}` : (data.error ?? "No se pudo enviar la prueba"),
        res.ok ? "success" : "error",
      );
    } finally {
      setTesting(false);
    }
  }

  async function handleSend(campaign: Campaign) {
    setSendingId(campaign.id);
    setConfirmSend(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}/send`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error ?? "No se pudo enviar", "error");
      } else if (data.result?.status === "partial") {
        toast(
          `Enviados ${data.result.sent}, fallaron ${data.result.failed}. Reintenta para completar.`,
          "error",
        );
      } else {
        toast(`Comunicado enviado a ${data.result?.sent ?? 0} personas`, "success");
      }
      await load();
    } finally {
      setSendingId(null);
    }
  }

  async function handleDelete(campaign: Campaign) {
    setDeletingId(campaign.id);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      toast(res.ok ? "Borrador eliminado" : (data.error ?? "No se pudo eliminar"), res.ok ? "success" : "error");
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  const canSave = draft.subject.trim().length > 0 && draft.bodyMd.trim().length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="min-w-[220px] flex-1">
          <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
            Entorno
          </span>
          <Select value={programId} onChange={(e) => setProgramId(e.target.value)}>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </label>
        <Button onClick={openNew} disabled={!programId}>
          <Plus size={16} /> Nuevo comunicado
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
        </div>
      ) : loadError ? (
        <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </p>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ca-ink/15 p-10 text-center">
          <Mail className="mx-auto mb-3 text-ca-ink-soft" size={28} />
          <p className="text-sm font-semibold text-ca-ink">Aún no hay comunicados</p>
          <p className="mt-1 text-[13px] text-ca-ink-soft">
            Crea uno para escribirle a los alumnos de este entorno.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {campaigns.map((campaign) => (
            <li
              key={campaign.id}
              className="rounded-2xl border border-ca-ink/[0.10] bg-ca-surface p-4 md:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[campaign.status] ?? "neutral"} dot>
                      {STATUS_LABEL[campaign.status] ?? campaign.status}
                    </Badge>
                    <span className="text-[11px] text-ca-ink-soft">
                      {campaign.cohorts?.name ?? "Todas las cohortes"}
                    </span>
                  </div>
                  <p className="mt-2 truncate text-[15px] font-bold text-ca-ink">
                    {campaign.subject}
                  </p>
                  <p className="mt-0.5 text-[12px] text-ca-ink-soft">
                    {campaign.status === "sent" || campaign.sent_count > 0
                      ? `${campaign.sent_count} de ${campaign.recipients_count} entregados`
                      : `Audiencia: ${(campaign.audience_status ?? []).map((s) => ENROLLMENT_LABEL[s] ?? s).join(", ")}`}
                  </p>
                  {campaign.error && (
                    <p className="mt-2 flex items-start gap-1.5 text-[12px] text-destructive">
                      <TriangleAlert size={14} className="mt-0.5 shrink-0" />
                      {campaign.error}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {campaign.status !== "sent" && campaign.status !== "sending" && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => openEdit(campaign)}>
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setConfirmSend(campaign)}
                        disabled={sendingId === campaign.id}
                      >
                        {sendingId === campaign.id ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Send size={14} />
                        )}
                        {campaign.status === "failed" ? "Reintentar" : "Enviar"}
                      </Button>
                    </>
                  )}
                  {campaign.status === "draft" && campaign.sent_count === 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Eliminar borrador"
                      onClick={() => handleDelete(campaign)}
                      disabled={deletingId === campaign.id}
                    >
                      <Trash2 size={14} />
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Editor */}
      <Dialog
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        aria-label="Editor de comunicado"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto"
      >
        <div className="space-y-4 p-5 md:p-6">
          <h2 className="text-[20px] font-black tracking-tight text-ca-ink">
            {editingId ? "Editar comunicado" : "Nuevo comunicado"}
          </h2>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="md:col-span-2">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
                Asunto
              </span>
              <Input
                value={draft.subject}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                placeholder="Cambios en el calendario de octubre"
              />
            </label>

            <label className="md:col-span-2">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
                Vista previa <span className="font-normal normal-case">(opcional)</span>
              </span>
              <Input
                value={draft.preheader}
                maxLength={200}
                onChange={(e) => setDraft({ ...draft, preheader: e.target.value })}
                placeholder="Lo que se ve junto al asunto en la bandeja de entrada"
              />
            </label>

            <label className="md:col-span-2">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
                Mensaje
              </span>
              <Textarea
                value={draft.bodyMd}
                rows={10}
                maxLength={20000}
                onChange={(e) => setDraft({ ...draft, bodyMd: e.target.value })}
                placeholder={"## Título\n\nTexto del comunicado. Admite **negrita**, *cursiva*, listas con - y [enlaces](https://...)."}
              />
              <span className="mt-1 block text-[11px] text-ca-ink-soft">
                Markdown básico: `##` títulos, `**negrita**`, `- ` listas, `[texto](url)` enlaces.
              </span>
            </label>

            <label>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
                Botón <span className="font-normal normal-case">(opcional)</span>
              </span>
              <Input
                value={draft.ctaLabel}
                maxLength={60}
                onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })}
                placeholder="Ver el calendario"
              />
            </label>
            <label>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
                Enlace del botón
              </span>
              <Input
                value={draft.ctaUrl}
                type="url"
                onChange={(e) => setDraft({ ...draft, ctaUrl: e.target.value })}
                placeholder="https://capitalacademy.cl/classroom"
              />
            </label>

            <label>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
                Cohorte
              </span>
              <Select
                value={draft.cohortId}
                onChange={(e) => setDraft({ ...draft, cohortId: e.target.value })}
              >
                <option value="">Todas las cohortes</option>
                {programCohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </label>

            <div>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-ca-ink-soft">
                Estado de matrícula
              </span>
              <div className="flex flex-wrap gap-1.5">
                {AUDIENCE_STATUSES.map((status) => {
                  const on = draft.audienceStatus.includes(status);
                  return (
                    <button
                      key={status}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleStatus(status)}
                      className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors ${
                        on
                          ? "bg-ca-violet text-white"
                          : "bg-ca-ink/5 text-ca-ink-soft hover:bg-ca-ink/10"
                      }`}
                    >
                      {ENROLLMENT_LABEL[status] ?? status}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-ca-bg-soft px-4 py-3">
            <Users size={16} className="text-ca-ink-soft" />
            <p className="text-[13px] text-ca-ink">
              {audienceLoading ? (
                "Calculando destinatarios…"
              ) : audienceCount === null ? (
                "No se pudo calcular la audiencia"
              ) : (
                <>
                  Este comunicado llegaría a{" "}
                  <strong className="font-black">{audienceCount}</strong>{" "}
                  {audienceCount === 1 ? "persona" : "personas"}
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditorOpen(false)}>
              Cancelar
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={!canSave || testing || saving}>
              {testing ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
              Enviarme una prueba
            </Button>
            <Button onClick={handleSave} disabled={!canSave || saving}>
              {saving && <Loader2 size={15} className="animate-spin" />}
              Guardar borrador
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Confirmación de envío */}
      <Dialog
        open={confirmSend !== null}
        onClose={() => setConfirmSend(null)}
        aria-label="Confirmar envío"
        className="w-full max-w-md"
      >
        {confirmSend && (
          <div className="space-y-4 p-6">
            <h2 className="text-[19px] font-black tracking-tight text-ca-ink">
              ¿Enviar este comunicado?
            </h2>
            <p className="text-[14px] leading-relaxed text-ca-ink-soft">
              Se enviará <strong className="text-ca-ink">“{confirmSend.subject}”</strong> a los
              alumnos de {confirmSend.cohorts?.name ?? "todas las cohortes"} de este entorno. Un
              correo enviado no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmSend(null)}>
                Cancelar
              </Button>
              <Button onClick={() => handleSend(confirmSend)}>
                <Send size={15} /> Enviar ahora
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <ToastContainer />
    </div>
  );
}
