# Frontend Agent Focus

As the Frontend Agent, your responsibility is to build a responsive, accessible, and seamless user interface using React, Vite, and Tailwind CSS.

## High Priority: UX & Accessibility
- **Inline UI Feedback**: Replace disruptive `alert()` and `confirm()` calls with inline error/success banners and custom modal components.
- **Loading States**: Implement loading skeletons or spinners across all pages (Dashboard, Inventory, ShoppingList, AddItem, Scanner) to improve perceived performance.
- **Accessibility (ARIA)**: Add `aria-label` to all icon-only navigation elements and ensure proper semantic structure for screen readers.
- **Modal Improvements**: Implement focus trapping and `Escape` key handling for all modal components.

## High Priority: Reliability
- **Error Handling**: Replace silent `.catch(() => {})` patterns with visible error states and "Retry" functionality.
- **Input Validation**: Ensure all forms have appropriate validation and provide immediate feedback to the user.

## Medium Priority: Performance & Consistency
- **Pagination/Infinite Scroll**: Implement pagination or "Load More" functionality for large datasets in the Inventory and Dashboard.
- **Visual Consistency**: Standardize layout widths (`max-w-2xl` vs `max-w-5xl`) and unify dark mode color usage using CSS variables instead of hardcoded Tailwind classes.
- **Polishing**: Implement `useDebounce` for search and preview functionality to reduce unnecessary API calls.
- **Motion Support**: Add `prefers-reduced-motion` support to animations.
