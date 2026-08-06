import { Router, type IRouter } from "express";
import healthRouter from "./health";
import jarvisRouter from "./jarvis";
import filesRouter from "./files";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/jarvis", jarvisRouter);
router.use("/files", filesRouter);

export default router;
