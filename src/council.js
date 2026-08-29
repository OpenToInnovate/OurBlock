/** Our Block boot: landing → walk pins → talk → stacker. Desk stays dead. */

import { createGlobe } from "./globe.js?v=ob19";
import {
  talkLines,
  challengeSpec,
  factsModel,
  factCopy,
  isLowSocial,
  sharePayload,
  civicLoseLine,
  civicFailRetryLine,
  civicWinLine,
} from "./talk.js?v=ob18";
import { createStacker } from "./stacker.js?v=ob14";
import { loadProgress, saveChallenge, challengeId, recordOf } from "./progress.js?v=ob16";
import { unlockAudio } from "./stack-fx.js?v=ob14";
