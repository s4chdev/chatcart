// AG Studio theme for ChatCart. Every value points at a CSS token in src/styles.css, so the shell,
// widgets, grids and charts share one palette: sandstone canvas, dabu indigo, saffron.
import { studioTheme } from 'ag-studio';

const token = (name: string) => `var(--cc-${name})`;
const line = (color: string) => ({ width: 1, color: token(color) });

const palette = Object.fromEntries(
  Array.from({ length: 10 }, (_, i) => [
    [`chartPaletteFills${i + 1}Color`, token(`chart-${i + 1}`)],
    [`chartPaletteStrokes${i + 1}Color`, token(`chart-${i + 1}`)],
  ]).flat(),
);

export const chatCartTheme = studioTheme.withParams({
  fontFamily: token('font'),
  fontSize: 14,
  textColor: token('ink'),
  foregroundColor: token('ink'),
  subtleTextColor: token('muted'),
  backgroundColor: token('surface'),
  borderColor: token('border'),
  accentColor: token('accent'),
  iconColor: token('indigo'),
  rowHoverColor: token('highlight'),

  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperSpacing: 0,
  studioWrapperBackgroundColor: token('canvas'),
  studioCanvasBorder: false,
  studioCanvasBorderRadius: 0,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: token('canvas'),
  studioCanvasPadding: 14,
  studioCanvasRowHeight: 18,
  studioCanvasFontFamily: token('font'),

  // Cards: warm paper, hairline border, 12px radius.
  studioWidgetBackgroundColor: token('surface'),
  studioWidgetBorder: line('border'),
  studioWidgetBorderRadius: 12,
  studioWidgetPadding: 12,
  studioWidgetTitleFontFamily: token('font'),
  studioWidgetTitleFontSize: 15,
  studioWidgetTitleFontWeight: 700,
  studioWidgetTitleTextColor: token('indigo'),
  studioWidgetSubtitleFontFamily: token('font'),
  studioWidgetSubtitleFontSize: 12,
  studioWidgetSubtitleTextColor: token('muted'),
  studioWidgetCaptionFontFamily: token('font'),
  studioWidgetCaptionFontSize: 12,
  studioWidgetCaptionTextColor: token('muted'),
  studioWidgetResizeBorderColor: token('saffron'),

  studioPanelContainerBackgroundColor: token('surface'),
  studioPanelContainerBorder: line('border'),
  studioPanelContainerBorderRadius: 0,
  studioPanelDividerColor: token('border'),
  studioPanelDividerActiveColor: token('accent'),
  studioPanelSectionBorderColor: token('border'),
  studioPanelHeaderFontFamily: token('font'),
  studioPanelHeaderFontWeight: 700,
  studioPanelChevronButtonHoverBackgroundColor: token('highlight'),
  studioPanelChevronButtonHoverColor: token('accent'),
  studioToggleButtonActiveBackgroundColor: token('highlight'),
  studioToggleButtonActiveBorderColor: token('accent'),
  studioToggleButtonActiveColor: token('indigo'),

  gridFontFamily: token('font'),
  gridFontSize: 13,
  gridCellTextColor: token('ink'),
  gridHeaderBackgroundColor: '#f6f1e8',
  gridHeaderTextColor: token('indigo'),
  gridHeaderFontWeight: 700,
  gridHeaderFontSize: 12,
  gridRowHeight: 36,
  gridRowBorder: line('gridline'),
  gridHeaderRowBorder: line('border'),
  gridPinnedRowBorder: line('border'),
  gridRowHoverColor: token('highlight'),
  gridWrapperBorder: false,

  chartFontFamily: token('font'),
  chartTextColor: token('ink'),
  chartSubtleTextColor: token('muted'),
  chartAxisLineColor: token('border'),
  chartGridLineColor: token('gridline'),
  ...palette,
});
