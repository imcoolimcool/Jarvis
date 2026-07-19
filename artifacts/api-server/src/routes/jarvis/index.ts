import { Router } from "express";
import transcribeRouter from "./transcribe";
import chatRouter from "./chat";
import speakRouter from "./speak";
import conversationsRouter from "./conversations";
import settingsRouter from "./settings";
import memoriesRouter from "./memories";
import gmailRouter from "./gmail";
import spotifyRouter from "./spotify";

const router = Router();

router.use(conversationsRouter);
router.use(settingsRouter);
router.use(memoriesRouter);
router.use(transcribeRouter);
router.use(chatRouter);
router.use(speakRouter);
router.use(gmailRouter);
router.use(spotifyRouter);

export default router;
