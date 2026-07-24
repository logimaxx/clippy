import { runMigrations } from "../src/db/client";
import { seedPublicClips } from "../src/lib/seed-public-clips";

runMigrations();
const count = await seedPublicClips({ verbose: true });
console.log(`Seeded ${count} public clip(s).`);
