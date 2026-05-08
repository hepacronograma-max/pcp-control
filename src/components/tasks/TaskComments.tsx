"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TaskComment } from "@/lib/types/tasks";

export interface TaskCommentsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskTitle: string;
  comments: TaskComment[];
  userNameById: Record<string, string>;
  canComment: boolean;
  onAdd: (text: string) => void | Promise<void>;
}

export function TaskComments({
  open,
  onOpenChange,
  taskTitle,
  comments,
  userNameById,
  canComment,
  onAdd,
}: TaskCommentsProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setText("");
  }, [open]);

  const sorted = useMemo(
    () =>
      [...comments].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      ),
    [comments]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || !canComment) return;
    setBusy(true);
    try {
      await onAdd(t);
      setText("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="pr-8">Comentários</SheetTitle>
          <p className="text-xs text-slate-500 font-normal line-clamp-2">{taskTitle}</p>
        </SheetHeader>
        <ScrollArea className="flex-1 min-h-0 rounded-md border border-slate-100 my-3 max-h-[50vh]">
          <div className="p-3 space-y-3">
            {sorted.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">Sem comentários ainda.</p>
            ) : (
              sorted.map((c) => {
                let when = c.created_at;
                try {
                  when = format(parseISO(c.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR });
                } catch {
                  /* keep raw */
                }
                const author = userNameById[c.user_id] ?? "Utilizador";
                return (
                  <article
                    key={c.id}
                    className="rounded-md bg-slate-50 border border-slate-100 p-3 text-sm"
                  >
                    <div className="flex justify-between gap-2 text-[11px] text-slate-500 mb-1">
                      <span className="font-medium text-slate-800">{author}</span>
                      <time dateTime={c.created_at}>{when}</time>
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap">{c.comment}</p>
                  </article>
                );
              })
            )}
          </div>
        </ScrollArea>
        {canComment ? (
          <form onSubmit={submit} className="space-y-2 border-t border-slate-100 pt-3">
            <Textarea
              placeholder="Escreva um comentário…"
              rows={3}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <Button
              type="submit"
              className="w-full bg-[#1B4F72] hover:bg-[#154360]"
              disabled={busy || !text.trim()}
            >
              Enviar
            </Button>
          </form>
        ) : (
          <p className="text-[11px] text-slate-500">Sem permissão para comentar.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
