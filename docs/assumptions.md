# Complete Assumptions & Scheduling Decisions

## 1. Domain & Calendar Assumptions
- **Target Month**: The primary test and operational demonstration month is **November 2026** (2026-11, 30 days).
- **Public Holidays**: Configured for November 2026 based on official Indian Gazetted holidays:
  - 2026-11-08: Diwali (Sunday)
  - 2026-11-09: Govardhan Puja (Monday)
  - 2026-11-10: Bhai Dooj (Tuesday)
  - 2026-11-24: Guru Nanak Jayanti (Tuesday)
- **Weekly Offs**: Every employee is legally and operationally entitled to at least one weekly off per calendar week (Monday through Sunday). Default designated off is Sunday (weekday 0), with staggered configurations (e.g. Monday or Saturday) to maintain operational balance.
- **Operating Calendars**:
  - `all_365`: Mandatory every single day (including Sundays and public holidays). Headcount is determined by `minHeadcountHoliday > 0 ? minHeadcountHoliday : minHeadcountSunday > 0 ? minHeadcountSunday : minHeadcountWeekday`.
  - `daily_no_holidays`: Operates Mon-Sun, but completely shuts down on public holidays.
  - `mon_sat_no_holidays`: Operates Mon-Sat, shutting down on Sundays and public holidays.
  - `custom`: Supports custom weekday masks and holiday bypass flags.

## 2. Hard Constraints (Non-Negotiable)
1. **Single Primary Status per Employee per Day**: An employee cannot have conflicting statuses (e.g. cannot be `working` and on `leave` or `comp_off` simultaneously).
2. **Approved Leave Inviolability**: Employees on approved leave (`planned`, `sick`, `other`) or approved comp-off are strictly unavailable for shift assignments.
3. **Mandatory Shift Coverage**: Every operating brand-process day requires at least `min_headcount` eligible employees assigned. Unmet slots raise blocking conflicts.
4. **Daily Load Limit**: Employees can work up to a maximum of 2 non-exclusive brand-processes per day (default configurable limit).

## 3. Soft Preferences (Scored & Balanced)
1. **Preferred Off Days**: The algorithm penalizes shifting an employee away from their designated weekly off weekday unless needed to satisfy hard coverage requirements.
2. **Fair Workload Distribution**: Shifts are allocated to candidates with the lowest cumulative month load first.
3. **Burnout Prevention**: The algorithm penalizes assigning employees to work more than 6 consecutive days without a rest day.

## 4. Single-Resource Brands vs. Multi-Resource Brands
- **Single-Resource Brand**: Defined as a brand-process where exactly 1 employee is mapped in `assignments`.
- When this employee is unavailable (weekly off, leave, comp-off), the scheduler engine raises an explicit `UNAVAILABLE_SOLE_RESOURCE` blocking conflict.
- The engine calculates backup candidates dynamically: active employees available on that date who share the same process (cross-brand) or same brand (cross-process).

## 5. Replanning & Historical Immutability
- Past days (< today / cutoff date) and shifts marked `pinned: true` are strictly immutable.
- When leaves are approved or shifts manually adjusted, only future unpinned days are re-solved.
- The replan produces a three-part diff: changed shifts, new conflicts, and resolved conflicts.
