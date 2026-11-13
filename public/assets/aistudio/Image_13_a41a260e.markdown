---
name: Atelier & Academia Design System
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45474c'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#545f73'
  primary: '#091426'
  on-primary: '#ffffff'
  primary-container: '#1e293b'
  on-primary-container: '#8590a6'
  inverse-primary: '#bcc7de'
  secondary: '#a73a00'
  on-secondary: '#ffffff'
  secondary-container: '#fd651e'
  on-secondary-container: '#571a00'
  tertiary: '#090055'
  on-tertiary: '#ffffff'
  tertiary-container: '#1f1a6f'
  on-tertiary-container: '#8887de'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d8e3fb'
  primary-fixed-dim: '#bcc7de'
  on-primary-fixed: '#111c2d'
  on-primary-fixed-variant: '#3c475a'
  secondary-fixed: '#ffdbce'
  secondary-fixed-dim: '#ffb599'
  on-secondary-fixed: '#370e00'
  on-secondary-fixed-variant: '#7f2b00'
  tertiary-fixed: '#e2dfff'
  tertiary-fixed-dim: '#c3c0ff'
  on-tertiary-fixed: '#100563'
  on-tertiary-fixed-variant: '#3e3c8f'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
typography:
  headline-xl:
    fontFamily: Plus Jakarta Sans
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 30px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-mobile: 0.75rem
  margin: 2rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

## Brand & Style

This design system establishes a refined institutional presence tailored for evening arts and cultural education. The aesthetic balances administrative precision with atelier warmth, projecting academic rigor without clinical detachment. 

The target audience encompasses cultural academy directors, workshop instructors, studio managers, and adult evening learners. Interactions must feel purposeful, swift, and respectful of the instructor’s physical classroom presence.

### Visual Style: Modern Institutional Atelier
- **Structured Precision:** High-density data tables, clear administrative hierarchy, and authoritative slate foundations reflect operational discipline.
- **Craft Warmth:** Terracotta and warm ochre accents inject the organic warmth of clay, raw canvas, and evening studio lighting.
- **Tactile Clarity:** Elevation is achieved through subtle, warm-tinted ambient shadows and crisp hairline borders rather than heavy skeuomorphism or stark brutalism.

## Colors

The palette is tuned for high-contrast legibility under varied lighting conditions, especially evening ambient light in studio environments.

### Palette Architecture
- **Primary (`#1E293B`):** Deep institutional slate. Used for primary typography, dominant navigation structures, active headers, and primary administrative actions.
- **Secondary (`#EA580C`):** Warm studio terracotta. Reserved for key focal accents, primary callouts, and cultural markers.
- **Tertiary (`#312E81`):** Deep indigo. Applied to academic metadata, secondary navigation highlights, and categorical workshop badges.
- **Neutral (`#64748B`):** Slate mid-tone for secondary labels, inactive borders, and structural dividers.

### Attendance Semantic States
- **Presente (`#059669` / Surface: `#ECFDF5` / Border: `#A7F3D0`):** Emerald green indicating active studio presence.
- **Ausente (`#DC2626` / Surface: `#FEF2F2` / Border: `#FECACA`):** Crimson red signaling unexcused absence.
- **Justificado (`#D97706` / Surface: `#FFFBEB` / Border: `#FDE68A`):** Warm amber representing documented exemptions.
- **Alerta Crítica (`#991B1B` / Surface: `#450A0A` / Text: `#FEF2F2`):** Deep burgundy indicating high absence thresholds (risk of loss of diploma/course credit).

### Surfaces & Backgrounds
- **App Canvas:** `#F8FAFC`
- **Surface Elevation 1 (Cards, Tables):** `#FFFFFF`
- **Surface Elevation 2 (Modals, Overlays):** `#FFFFFF`
- **Surface Inset (Search fields, inactive cells):** `#F1F5F9`
- **Hairline Borders:** `#E2E8F0`

## Typography

The typographic system combines the geometric warmth of **Plus Jakarta Sans** for editorial and administrative headers with the neutral clarity of **Inter** for data density, tables, and functional forms.

### Usage Rules
- **Headlines:** Use Plus Jakarta Sans exclusively for page titles, modal heads, workshop catalog banners, and aggregated numerical KPIs.
- **Data & Tables:** Inter is mandated across all tabular grids, student logs, and metadata pairings.
- **Numbers & Counters:** Ensure `font-variant-numeric: tabular-nums` is globally enabled across all attendance registers, roll calls, and export dialogs to ensure exact vertical character alignment.

## Layout & Spacing

The layout is built around a structured 12-column grid on desktop (`1280px` max container width) and an 8-column layout on tablet (`768px` to `1024px`), compressing into a 4-column layout below `768px`.

### Rhythmic Discipline
- Spacing follows an 8pt base grid with a 4pt sub-grid for compact administrative tables.
- **Data Densities:** Table rows enforce a standard 48px height with 16px lateral cell padding (`space-md`). Dense mode scales rows down to 36px with 8px vertical padding (`space-sm`).
- **Lateral Alignment:** Form actions and tabular bulk-action bars must strictly adhere to the defined section margin bounds without arbitrary floating offsets.

## Elevation & Depth

Visual hierarchy relies on low-contrast structural boundaries and subtle ambient light. Avoid heavy black dropshadows; instead, use slate-tinted ambient occlusions.

### Depth Hierarchy
- **Level 0 (Base Canvas):** `#F8FAFC`, flat.
- **Level 1 (Workshop Cards, Content Panels):** `#FFFFFF` with hairline border `1px solid #E2E8F0` and shadow `0 1px 3px 0 rgba(15, 23, 42, 0.05), 0 1px 2px -1px rgba(15, 23, 42, 0.03)`.
- **Level 2 (Hovered Cards, Dropdowns, Datepickers):** `#FFFFFF` with hairline border `1px solid #CBD5E1` and shadow `0 4px 6px -1px rgba(15, 23, 42, 0.07), 0 2px 4px -2px rgba(15, 23, 42, 0.04)`.
- **Level 3 (Modals, Overlays, Justification Drawers):** `#FFFFFF` with shadow `0 20px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.06)`, framed against a `rgba(15, 23, 42, 0.45)` backdrop with `backdrop-filter: blur(4px)`.

## Shapes

The design system maintains a balanced **Rounded (`2`)** shape vocabulary:
- **Base Components (Inputs, Buttons, Badges):** `0.5rem` (8px). Delivers a modern institutional feel without looking playful or juvenile.
- **Containers (Cards, Dialogs, Tables):** `1rem` (16px) for outer container radiuses.
- **Attendance Chips:** Standardized to full pill capsules (`9999px`) to create an immediate visual distinction between actionable filters, status capsules, and rectangular layout containers.

## Components

### Attendance Status Chips (3-State System)
Interactive segmented controls for each enrolled student row:
- **Structure:** 3 linked pill segments (`P`, `A`, `J`) or independent selectable toggle chips.
- **Presente (`P`):** `#ECFDF5` background, `#059669` text, `#A7F3D0` border. Active state applies `#059669` background with white text.
- **Ausente (`A`):** `#FEF2F2` background, `#DC2626` text, `#FECACA` border. Active state applies `#DC2626` background with white text.
- **Justificado (`J`):** `#FFFBEB` background, `#D97706` text, `#FDE68A` border. Active state triggers justification note affordance (pencil glyph).

### Threshold Risk Badges
- Displayed next to student name when cumulative absences exceed policy limits.
- **Warning (>15% absences):** Amber chip (`#FEF3C7` background, `#B45309` text).
- **Critical Lockout (�IHX��[��\�N����\��[�HY�
�NLP�P��X��ܛ�[�ё�����^X�[���Y\���H�Z�H�K�������ܚ����[[X\�H�\�H�]H[]�]Y�\��X�H
]�[X
H�]H�\�X�[X��[���\HۈHY��ܙ\�\�[��H�[\�[\��X��H
�PMN�
H܈[��]][ۘ[[�Y��
��L�NX
K��H�\�XY\�\�^\��ܚ���]H
K�ˋ
�ܘX�Y�H]�ܘY��XHRRJ�K[���X�܈�[YK��Y[H

�N��H���
�K[��[[���YXY��[���H���H�\�Y\��ݚY\�H��\X���ܙ\���\����[��Z[H][ܝ[H\��[�Y�K������X�[\�][�[��H�Y]�H�^YXY\��]�Y[�Y[�Y�Y\��Y[��[YK\�ܚX�[\��[�Y�H�]K]ZX��[X\��][�[��H[�[��۝^X�[ۈ�Y��\�
�\�X�[[\�\�K��H[\��][���X�H���ݙ\��]H
ю�Q��
K��H�X��H�Y���[[��܈�[��KX�X���\�Y�X�][ۈ[�[�Y��\�˂������\�Y�X�][ۈ[�[�H��[YY[�]�[�[]�][ۋ��H[��Y\��XY[ۛH�Y[��ܚ����۝^]H�[X�܋�X\�ۈ�]Y�ܞH���ۈ
p�YX�KX�ܘ[�Y\��HX^[܊K^\�XH�܈�\��H��\�[�H�Y�X[�Y���[H\�Y\��]�܈�ܛX[�\�Y�X�]H]X�Y[�˂�����^ܝ�۝��HZ\�YX�[ۈ�]ۈܛ�\]X�H�\�Y���H
��^ܝ��������]ۈ�[H�]��[Y[�X�ۋZ\�[�H�ܙ\��L�N��]H^�QL�LИ��H
��^ܝ^�[�������]ۈ�[H�]��XY�Y]X�ۋ�]H^�QL�LИ��H
���]�H�Y�\�\�����[X\�H��Y�]ۈ
�QL�LИ�X��ܛ�[�ё�����^
K