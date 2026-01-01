/**
 * 🔥 MESSAGING FUNCTIONS
 * Handles message sessions, messages, and participants
 * HTTP versions removed to reduce CPU quota - use callable versions instead
 */

export { getMessageSessions } from './getMessageSessions';
export { createMessageSession } from './createMessageSession';
export { sendMessage } from './sendMessage';
export { getMessages } from './getMessages';
export { markMessagesAsRead } from './markMessagesAsRead';
export { deleteMessage } from './deleteMessage';
export { getParticipants } from './getParticipants';
export { addParticipant } from './addParticipant';
export { removeParticipant } from './removeParticipant';
export { updateMessageSession } from './updateMessageSession';

