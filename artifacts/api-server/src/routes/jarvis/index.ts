import { Router } from "express";
import transcribeRouter from "./transcribe";
import chatRouter from "./chat";
import speakRouter from "./speak";

const router = Router();

router.use(transcribeRouter);
router.use(chatRouter);
router.use(speakRouter);

export default router;
