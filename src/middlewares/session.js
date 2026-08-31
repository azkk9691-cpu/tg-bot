import { USER_STATES } from '../config/constants.js';

// In-memory session store
const sessions = new Map();

/**
 * Clean In-Memory Session Middleware
 */
export function sessionMiddleware() {
  return async (ctx, next) => {
    if (!ctx.from) return next();

    const userId = ctx.from.id;

    if (!sessions.has(userId)) {
      sessions.set(userId, {
        state: USER_STATES.IDLE,
        data: {},
      });
    }

    const userSession = sessions.get(userId);

    ctx.session = {
      get state() {
        return userSession.state;
      },
      set state(val) {
        userSession.state = val;
      },
      get data() {
        return userSession.data;
      },
      set data(val) {
        userSession.data = val;
      },
      reset() {
        userSession.state = USER_STATES.IDLE;
        userSession.data = {};
      },
      setState(state, data = {}) {
        userSession.state = state;
        userSession.data = data;
      },
    };

    return next();
  };
}
