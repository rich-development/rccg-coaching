import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// 9:00 AM Eastern in winter, 10:00 AM in summer.
crons.daily("send scheduled check-ins and reviews", { hourUTC: 14, minuteUTC: 0 }, internal.automation.daily);

export default crons;
