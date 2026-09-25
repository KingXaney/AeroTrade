// The square icon affordance (widget toolbars, dialog close, row actions). Was a verbatim
// duplicate in components/dashboard/WidgetShell.tsx and components/settings/DashboardSettings.tsx.
// A class string rather than a component: these sit on buttons that already carry their own
// handlers, aria-labels and disabled logic, and wrapping them would buy nothing.
//
// rounded-[var(--control-radius)] rather than rounded-md so it follows the style axis.
export const iconButton =
    'inline-flex items-center justify-center size-7 rounded-[var(--control-radius)] text-fg-muted ' +
    'hover:text-fg hover:bg-surface-3 transition-colors disabled:opacity-30 disabled:hover:bg-transparent';
