-- =============================================================================
-- Conversaciones — Iteración 2: reacciones con emoji.
--
-- Antes: una sola reacción ❤️ por usuario por target (índice único
-- (user_id, thread_id) / (user_id, comment_id)). Ahora el usuario elige UN
-- emoji del set; el índice único se mantiene (una reacción por usuario por
-- target, puede cambiar de emoji). Los contadores se agrupan por emoji.
--
-- Backward-compatible: las reacciones existentes quedan con ❤️ por el default,
-- así que el código viejo sigue funcionando hasta que se despliegue el nuevo.
-- =============================================================================

alter table public.conversation_reactions
  add column if not exists emoji text not null default '❤️';

-- Set permitido = los emojis de la UI. Las filas existentes son '❤️' → válidas.
alter table public.conversation_reactions
  drop constraint if exists conversation_reactions_emoji_chk;
alter table public.conversation_reactions
  add constraint conversation_reactions_emoji_chk
  check (emoji in ('❤️', '👍', '🎉', '💡'));
