# Consistent Button and Form Control Sizing

This document outlines the standardized sizing system implemented across all buttons and form controls using a **custom optimized sizing system** with **proportional font sizes** to ensure visual consistency throughout the application.

## Size Variants - Custom Optimized System with Proportional Fonts

The following size variants are available for both buttons and form controls, using carefully chosen heights with proportionally scaled font sizes:

| Size | Class Suffix | Height | Font Size | Padding |
|------|-------------|--------|-----------|---------|
| Extra Small | `-xs` | 24px (1.5rem) | 11px (0.6875rem) | 0.125rem 0.5rem |
| Small | `-sm` | 30px (1.875rem) | 13px (0.8125rem) | 0.25rem 0.75rem |
| Default | _(none)_ | 38px (2.375rem) | 16px (1rem) | 0.325rem 0.565rem |
| Large | `-lg` | 46px (2.875rem) | 18px (1.125rem) | 0.5rem 1rem |
| Extra Large | `-xl` | 56px (3.5rem) | 20px (1.25rem) | 0.75rem 1.25rem |

## Benefits of Custom Sizing System

✅ **Proportional Font Scaling**: Font sizes scale harmoniously with height increases  
✅ **Balanced Increments**: Thoughtful progression from 24→30→38→46→56  
✅ **Touch-Friendly**: All sizes meet accessibility guidelines for touch targets  
✅ **Visual Harmony**: Each size feels distinct yet proportionally related  
✅ **Readable Text**: Font sizes optimized for readability at each height  
✅ **Flexible**: Not constrained by rigid grid, optimized for your needs  

## Font Size Progression

The font sizes follow a natural progression that maintains readability and visual balance:

```
XS: 11px font in 24px container (46% ratio)
SM: 13px font in 30px container (43% ratio)  
MD: 16px font in 38px container (42% ratio)
LG: 18px font in 46px container (39% ratio)
XL: 20px font in 56px container (36% ratio)
```

## Visual Hierarchy

```
XL (56px/20px) ████████████████████  Hero/CTA buttons, Primary actions
LG (46px/18px) ████████████████      Important buttons, Form submissions  
MD (38px/16px) ████████████          Default buttons/inputs, Standard UI
SM (30px/13px) ██████████            Dense layouts, Secondary actions
XS (24px/11px) ████████              Compact interfaces, Icon buttons
```

## Shared Variables

The consistent sizing is achieved through shared SCSS variables defined in `src/scss/variables/_buttons.scss`:

```scss
// Size System - Custom Optimized Heights with Proportional Font Sizes
// XS size - 24px height
$input-btn-font-size-xs:      0.6875rem !default; // 11px - compact font for 24px height
$input-btn-minheight-xs:      1.5rem !default; // 24px
$input-btn-padding-xs:        0.125rem 0.5rem !default;

// SM size - 30px height
$input-btn-font-size-sm:      0.8125rem !default; // 13px - proportional to 30px height
$input-btn-minheight-sm:      1.875rem !default; // 30px
$input-btn-padding-sm:        0.25rem 0.75rem !default;

// Base size - 38px height
$input-btn-minheight:         2.375rem !default; // 38px
// Default font size remains 1rem (16px) from _config.scss

// LG size - 46px height
$input-btn-font-size-lg:      1.125rem !default; // 18px - proportional to 46px height
$input-btn-minheight-lg:      2.875rem !default; // 46px
$input-btn-padding-lg:        0.5rem 1rem !default;

// XL size - 56px height
$input-btn-font-size-xl:      1.25rem !default; // 20px - proportional to 56px height
$input-btn-minheight-xl:      3.5rem !default; // 56px
$input-btn-padding-xl:        0.75rem 1.25rem !default;
```

## Components Using Consistent Sizing

### Buttons
- Regular buttons (`.btn`, `.btn-xs`, `.btn-sm`, `.btn-lg`, `.btn-xl`)
- Icon buttons (`.btn-icon`, `.btn-icon-xs`, `.btn-icon-sm`, `.btn-icon-lg`, `.btn-icon-xl`)
- Button groups (`.btn-group-xs`, `.btn-group-sm`, `.btn-group-lg`, `.btn-group-xl`)

### Form Controls
- Text inputs (`.form-control`, `.form-control-xs`, `.form-control-sm`, `.form-control-lg`, `.form-control-xl`)
- Select dropdowns (`.form-select`, `.form-select-xs`, `.form-select-sm`, `.form-select-lg`, `.form-select-xl`)
- Input groups (`.input-group-xs`, `.input-group-sm`, `.input-group-lg`, `.input-group-xl`)
- Checkboxes and radios (`.form-check-xs`, `.form-check-sm`, `.form-check-lg`, `.form-check-xl`)

### Other Components
- Navigation links with size variants
- Dropdown items with size variants

## Usage Examples

### Buttons
```html
<button class="btn btn-primary btn-xs">Compact (24px/11px)</button>
<button class="btn btn-primary btn-sm">Small (30px/13px)</button>
<button class="btn btn-primary">Default (38px/16px)</button>
<button class="btn btn-primary btn-lg">Large (46px/18px)</button>
<button class="btn btn-primary btn-xl">Hero (56px/20px)</button>
```

### Form Controls
```html
<input type="text" class="form-control form-control-xs" placeholder="Compact (24px/11px)">
<input type="text" class="form-control form-control-sm" placeholder="Small (30px/13px)">
<input type="text" class="form-control" placeholder="Default (38px/16px)">
<input type="text" class="form-control form-control-lg" placeholder="Large (46px/18px)">
<input type="text" class="form-control form-control-xl" placeholder="Hero (56px/20px)">
```

### Input Groups
```html
<div class="input-group input-group-sm">
  <span class="input-group-text">@</span>
  <input type="text" class="form-control" placeholder="Username">
  <button class="btn btn-primary" type="button">Go</button>
</div>
```

## Design Recommendations

### When to Use Each Size:

- **XS (24px/11px)**: Compact tables, toolbar buttons, dense layouts
- **SM (30px/13px)**: Secondary actions, form controls in sidebars  
- **MD (38px/16px)**: Standard UI elements, most form controls
- **LG (46px/18px)**: Primary actions, important form submissions
- **XL (56px/20px)**: Hero buttons, call-to-actions, landing pages

## Benefits

1. **Visual Consistency**: All interactive elements maintain perfect proportional relationships
2. **Proportional Scaling**: Font sizes scale harmoniously with container heights
3. **Optimal Readability**: Each font size is optimized for its container size
4. **Accessibility**: All sizes meet touch target guidelines (minimum 24px)
5. **Balanced Progression**: Natural, comfortable size and font increments
6. **Practical Design**: Focused on real-world usability and visual appeal
7. **Design System**: Provides a solid foundation for a cohesive, professional design system

## Files Modified

- `src/scss/variables/_buttons.scss` - Updated shared sizing variables with proportional fonts
- `src/scss/components/_buttons.scss` - Applied consistent sizing to buttons
- `src/scss/components/forms/_form-control.scss` - Applied consistent sizing to form controls
- `src/scss/components/forms/_form-select.scss` - Applied consistent sizing to select elements
- `src/scss/components/forms/_input-group.scss` - Applied consistent sizing to input groups
- `src/scss/components/forms/_form-check.scss` - Applied consistent sizing to checkboxes/radios
