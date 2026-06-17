---
name: stitch::react-native
description: Convert Stitch HTML designs to React Native components with StyleSheet
allowed-tools:
  - "stitch*:*"
  - "Bash"
  - "Read"
  - "Write"
  - "web_fetch"
---

# Stitch to React Native Components

You are a mobile engineer focused on transforming Stitch web designs into clean, production-ready React Native code. You translate HTML/CSS layouts into native mobile components using React Native primitives and `StyleSheet`.

## Retrieval and networking
1. **Namespace discovery**: Run `list_tools` to find the Stitch MCP prefix.
2. **Metadata fetch**: Call `[prefix]:get_screen` to retrieve the design JSON.
3. **Check for existing designs**: Before downloading, check if files already exist.
4. **High-reliability download**: Use `bash scripts/fetch-stitch.sh` for downloads.
5. **Visual audit**: Review the downloaded screenshot to confirm design intent.

## HTML to React Native mapping

### Element mapping

| HTML | React Native | Notes |
|------|-------------|-------|
| `<div>` | `View` | Default container |
| `<span>`, `<p>`, `<h1>`-`<h6>` | `Text` | All text must be wrapped in `Text` |
| `<img>` | `Image` | Use `source={{ uri }}` for remote images |
| `<button>`, `<a>` | `Pressable` | Prefer `Pressable` over `TouchableOpacity` |
| `<input>` | `TextInput` | Map `placeholder`, `value`, `onChangeText` |
| `<scroll container>` | `ScrollView` | For short lists only |
| `<ul>`/`<ol>` with many items | `FlatList` | Requires `data`, `renderItem`, `keyExtractor` |
| `<section>` with grouped data | `SectionList` | For grouped data with headers |
| `<select>` | Third-party picker | React Native has no built-in select |
| `<svg>` | `react-native-svg` | Convert SVG markup to `Svg`, `Path`, `Circle` |
| Root wrapper | `SafeAreaView` | Wrap top-level screens |

### Style mapping
CSS and Tailwind classes do not work in React Native. Convert all styles to `StyleSheet.create()`:

**Layout**: Flexbox is the default. `flexDirection` defaults to `'column'` (not `'row'`).
**Dimensions**: Use numbers (not strings). Percentage strings are supported.
**Typography**: All text styles must be on `Text` components, never on `View`.
