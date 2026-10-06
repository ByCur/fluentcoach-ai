import { useEffect, useState } from "react";
import type { PrivacyJob } from "@fluentcoach/domain";
export function PrivacyPanel({
  csrf,
  onDeleted,
  onClose,
}: {
  csrf: string;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const [job, setJob] = useState<PrivacyJob | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const send = (path: string, body: unknown) =>
    fetch("/api/v1/privacy/" + path, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify(body),
    });
  useEffect(() => {
    if (job?.state !== "pending") return;
    let active = true;
    const timer = setInterval(() => {
      void fetch("/api/v1/privacy/exports/" + job.id, {
        credentials: "include",
      })
        .then(async (r) => {
          if (r.ok && active) setJob((await r.json()) as PrivacyJob);
          else if (active) setMessage("No pudimos consultar la exportación.");
        })
        .catch(() => {
          if (active) setMessage("No pudimos consultar la exportación.");
        });
    }, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [job?.id, job?.state]);
  return (
    <main>
      <header>
        <h1>Privacidad y tus datos</h1>
        <button onClick={onClose}>Volver</button>
      </header>
      <p>
        Las transcripciones y los informes se conservan durante 90 días. Tu
        vocabulario confirmado y el historial estructurado permanecen hasta que
        elimines tu cuenta. No guardamos grabaciones de audio.
      </p>
      <section aria-labelledby="export-title">
        <h2 id="export-title">Exportar mis datos</h2>
        <p>
          El archivo JSON incluye tu perfil, consentimiento, conversaciones,
          informes, vocabulario, planes y progreso. Está disponible durante 24
          horas; después se elimina automáticamente.
        </p>
        <button
          disabled={busy || job?.state === "pending"}
          onClick={() => {
            setBusy(true);
            setMessage("");
            const key = job ? crypto.randomUUID() : requestKey;
            setRequestKey(key);
            setJob(null);
            void send("exports", { requestKey: key })
              .then(async (r) => {
                if (!r.ok) throw Error();
                setJob((await r.json()) as PrivacyJob);
              })
              .catch(() =>
                setMessage(
                  "No pudimos preparar la exportación. Puedes volver a intentarlo.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          Exportar mis datos
        </button>
        <p role="status">
          {job?.state === "pending"
            ? "Preparando tu archivo…"
            : job?.state === "completed"
              ? job.expiresAt
                ? "Tu archivo está preparado."
                : "El archivo ha caducado. Puedes crear una nueva exportación."
              : job?.state === "failed"
                ? "No se pudo generar el archivo."
                : ""}
        </p>
        {job?.state === "completed" && job.expiresAt && (
          <>
            <a
              href={"/api/v1/privacy/exports/" + job.id + "/download"}
              download
            >
              Descargar mis datos
            </a>
            <p>
              Disponible hasta {new Date(job.expiresAt).toLocaleString("es")}.
            </p>
          </>
        )}
      </section>
      <section aria-labelledby="delete-title">
        <h2 id="delete-title">Eliminar mi cuenta y mis datos</h2>
        <p>
          Esta acción eliminará tu perfil, conversaciones, informes,
          vocabulario, planes y progreso. No se puede deshacer desde
          FluentCoach.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          Confirmo que quiero eliminar mi cuenta y mis datos.
        </label>
        <button
          disabled={!confirmed || busy}
          onClick={() => {
            setBusy(true);
            void send("deletion", {
              requestKey: crypto.randomUUID(),
              confirmed: true,
            })
              .then((r) => {
                if (!r.ok) throw Error();
                onDeleted();
              })
              .catch(() =>
                setMessage(
                  "No pudimos iniciar la eliminación. Puedes volver a intentarlo.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          Eliminar mi cuenta y mis datos
        </button>
      </section>
      <p role="alert">{message}</p>
    </main>
  );
}
