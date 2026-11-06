// The settings feature's public API. Other features import only from here ("@/features/settings").
// The root layout imports SettingsSync and SETTINGS_SCRIPT by path.

export { SettingsPage } from "./components/SettingsPage";
export { useSettings } from "./hooks/use-settings";
export {
  DEFAULT_SETTINGS,
  motionScale,
  readSettings,
  resetSettings,
  updateSettings,
  type CursorStyle,
  type MotionSetting,
  type Settings,
} from "./services/settings";
