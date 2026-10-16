import { useEffect, useState } from "react";
import type {
  ActivityEvent,
  ControlState,
  HumanAnnotation,
  HumanQuestion,
  ServerEvent,
} from "portholejs/protocol";

function mergeActivity(current: ActivityEvent[], event: ActivityEvent): ActivityEvent[] {
  if (current.some((item) => item.id === event.id)) return current;
  return [...current, event].sort((a, b) => a.id - b.id).slice(-500);
}

export function useServerEvents(ws: WebSocket | null, deviceId: string | null) {
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [control, setControl] = useState<ControlState>({
    holder: "shared",
    since: new Date().toISOString(),
  });
  const [questions, setQuestions] = useState<HumanQuestion[]>([]);
  const [annotations, setAnnotations] = useState<HumanAnnotation[]>([]);
  const [lastActivity, setLastActivity] = useState<ActivityEvent | null>(null);

  useEffect(() => {
    setActivities([]);
    setQuestions([]);
    setAnnotations([]);
    const abort = new AbortController();
    const query = deviceId ? `?device=${encodeURIComponent(deviceId)}` : "";
    void Promise.all([
      fetch(`/api/activity${query}`, { signal: abort.signal }).then((res) => res.json()),
      fetch(`/api/control${query}`, { signal: abort.signal }).then((res) => res.json()),
      fetch(`/api/questions${query ? query + "&" : "?"}status=open`, {
        signal: abort.signal,
      }).then((res) => res.json()),
      fetch(`/api/annotations${query}`, { signal: abort.signal }).then((res) =>
        res.json(),
      ),
    ])
      .then(([activity, state, questionList, annotationList]) => {
        if (abort.signal.aborted) return;
        setActivities((activity as { events: ActivityEvent[] }).events ?? []);
        setControl(state as ControlState);
        setQuestions((questionList as { questions: HumanQuestion[] }).questions ?? []);
        setAnnotations(
          (annotationList as { annotations: HumanAnnotation[] }).annotations ?? [],
        );
      })
      .catch(() => undefined);
    return () => abort.abort();
  }, [deviceId]);

  useEffect(() => {
    if (!ws) return;
    const process = (raw: string) => {
      let event: ServerEvent;
      try {
        event = JSON.parse(raw) as ServerEvent;
      } catch {
        return;
      }
      if (event.type === "activity") {
        setActivities((current) => mergeActivity(current, event.event));
        setLastActivity(event.event);
      } else if (event.type === "control") setControl(event.state);
      else if (event.type === "question") {
        setQuestions((current) =>
          event.question.status === "open"
            ? [
                ...current.filter((value) => value.id !== event.question.id),
                event.question,
              ]
            : current.filter((value) => value.id !== event.question.id),
        );
      } else if (event.type === "annotation") {
        setAnnotations((current) =>
          event.annotation.dismissed
            ? current.filter((value) => value.id !== event.annotation.id)
            : [
                ...current.filter((value) => value.id !== event.annotation.id),
                event.annotation,
              ],
        );
      }
    };
    const handler = (event: MessageEvent) => {
      if (typeof event.data === "string") process(event.data);
    };
    ws.addEventListener("message", handler);
    const wsAny = ws as unknown as Record<string, unknown>;
    const early = wsAny._earlyServerEvents as string[] | undefined;
    if (early) {
      for (const raw of early) process(raw);
      early.length = 0;
    }
    const mark = wsAny._markServerEventsDrained as (() => void) | undefined;
    mark?.();
    return () => ws.removeEventListener("message", handler);
  }, [ws]);

  return { activities, control, questions, annotations, lastActivity };
}
