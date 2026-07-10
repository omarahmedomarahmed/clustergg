"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addComment } from "@/app/actions/social";
import Avatar from "@/components/Avatar";
import { timeAgo } from "@/lib/utils";

type CommentRow = {
  comment: { id: string; parentCommentId: string | null; body: string; createdAt: Date };
  author: { slug: string; displayName: string; avatarUrl: string | null };
};

export default function CommentThread({
  postId, comments, viewerId, path,
}: { postId: string; comments: CommentRow[]; viewerId: string | null; path: string }) {
  const [open, setOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const roots = comments.filter((c) => !c.comment.parentCommentId);
  const childrenOf = (id: string) => comments.filter((c) => c.comment.parentCommentId === id);

  const submit = (parentId: string | null) => (formData: FormData) => {
    startTransition(async () => {
      await addComment(postId, parentId, path, formData);
      setReplyTo(null);
    });
  };

  if (!open && comments.length === 0 && !viewerId) return null;

  return (
    <div className="mt-3 border-t border-violet-400/10 pt-3">
      {!open ? (
        <button onClick={() => setOpen(true)} className="text-xs text-muted hover:text-cyan-300">
          {comments.length > 0 ? `View ${comments.length} comment${comments.length === 1 ? "" : "s"}` : "Add a comment"} →
        </button>
      ) : (
        <div className="space-y-3">
          {roots.map(({ comment, author }) => (
            <div key={comment.id}>
              <div className="flex gap-2.5">
                <Avatar name={author.displayName} src={author.avatarUrl} size={26} />
                <div className="min-w-0 flex-1">
                  <div className="text-xs">
                    <Link href={`/u/${author.slug}`} className="font-semibold hover:text-cyan-300">{author.displayName}</Link>
                    <span className="text-muted"> · {timeAgo(comment.createdAt)}</span>
                  </div>
                  <p className="text-sm mt-0.5">{comment.body}</p>
                  {viewerId && (
                    <button onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)} className="text-[11px] text-muted hover:text-cyan-300 mt-0.5">
                      Reply
                    </button>
                  )}
                  {childrenOf(comment.id).map(({ comment: child, author: childAuthor }) => (
                    <div key={child.id} className="mt-2 ml-3 border-l border-violet-400/15 pl-3 flex gap-2">
                      <Avatar name={childAuthor.displayName} src={childAuthor.avatarUrl} size={22} />
                      <div>
                        <div className="text-xs">
                          <Link href={`/u/${childAuthor.slug}`} className="font-semibold hover:text-cyan-300">{childAuthor.displayName}</Link>
                          <span className="text-muted"> · {timeAgo(child.createdAt)}</span>
                        </div>
                        <p className="text-sm mt-0.5">{child.body}</p>
                      </div>
                    </div>
                  ))}
                  {replyTo === comment.id && (
                    <form action={submit(comment.id)} className="mt-2 flex gap-2">
                      <input name="body" required placeholder="Write a reply…" className="input-cosmic !py-1.5 text-sm" autoFocus />
                      <button disabled={pending} className="ghost-btn rounded-full px-4 text-xs">Send</button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}
          {viewerId ? (
            <form action={submit(null)} className="flex gap-2 pt-1">
              <input name="body" required placeholder="Add a comment…" className="input-cosmic !py-1.5 text-sm" />
              <button disabled={pending} className="ghost-btn rounded-full px-4 text-xs">Post</button>
            </form>
          ) : (
            <p className="text-xs text-muted"><Link href="/login" className="text-cyan-300 underline">Log in</Link> to join the conversation.</p>
          )}
        </div>
      )}
    </div>
  );
}
