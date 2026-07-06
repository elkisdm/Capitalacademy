// Set único de emojis permitidos para reaccionar en el foro de conversaciones.
// Debe coincidir con el check de `public.conversation_reactions.emoji`.
// El orden acá define el orden de despliegue de chips y del picker.

export const REACTION_EMOJIS = ["❤️", "👍", "🎉", "💡"] as const;

export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export function isReactionEmoji(v: unknown): v is ReactionEmoji {
  return typeof v === "string" && (REACTION_EMOJIS as readonly string[]).includes(v);
}
