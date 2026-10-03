export type SectionFeedbackState = { kind: 'success' | 'error'; scope: string; text: string }

export function SectionFeedback({ feedback }: { feedback: SectionFeedbackState | null }) {
  if (!feedback) return null
  if (feedback.kind === 'success') return <p className="success-message" role="status">{feedback.text}</p>
  return <p className="form-error" role="alert">{feedback.text}</p>
}
