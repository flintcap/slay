/**
 * Story lab: the UI lab (real HUD and panels, no WebGL) plus the story layer,
 * so `tools/shot-story.mjs --lab` can photograph the dialogue box, journal,
 * cards and subtitles in seconds instead of waiting on a 3D boot.
 */
import './uilab-entry';
import { installStory } from '../src/ui/StoryOverlay';
import { events } from '../src/core/Events';
import { save } from '../src/core/Save';

installStory();
// The same handles shot-story drives in the real game.
(window as unknown as Record<string, unknown>).SLAY = { save, events };
