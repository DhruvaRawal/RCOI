/**
 * zod schemas for client -> server payloads. Imported by the server via "@rcoi/shared/schemas"
 * (not from the main entry), so the client bundle does not include zod.
 */
import { z } from 'zod';
import { ROOM_CONFIG } from './config';

const name = z
  .string()
  .trim()
  .min(1, 'Enter a name')
  .max(ROOM_CONFIG.maxNameLength, `Names can be at most ${ROOM_CONFIG.maxNameLength} characters`);
const id = z.string().min(1).max(64);

export const CreateRoomSchema = z.object({ name });
export const JoinRoomSchema = z.object({ code: z.string().trim().toUpperCase().min(3).max(8), name });
export const ResumeSchema = z.union([
  z.object({ token: z.string().min(16).max(128) }),
  z.object({ code: z.string().trim().toUpperCase().min(3).max(8), rejoinCode: z.string().trim().toUpperCase().min(4).max(12) }),
]);

export const PlayerActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('PLAY'), cardId: id, pileId: id }),
  z.object({ type: z.literal('CHALLENGE'), pileId: id, cardId: id }),
  z.object({ type: z.literal('DRAW') }),
  z.object({ type: z.literal('USE_ABILITY'), abilityId: id, targetPlayer: id.optional(), cardId: id.optional() }),
  z.object({ type: z.literal('REACT'), abilityId: id.nullable() }),
  z.object({ type: z.literal('GIVE'), cardId: id }),
]);

export type CreateRoomPayload = z.infer<typeof CreateRoomSchema>;
export type JoinRoomPayload = z.infer<typeof JoinRoomSchema>;
export type ResumePayload = z.infer<typeof ResumeSchema>;


export const BotTargetSchema = z.object({ playerId: id });
export const BotDifficultySchema = z.object({ playerId: id, difficulty: z.enum(['easy', 'medium', 'hard']) });
