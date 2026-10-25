# Walk test (V4), Oct 25 2026

## Setup
Room: Avik's bedroom
Board position: front edge of right desk, front (away from USB) facing wall
Board distance from wall it faces: 19 in
Capture: MacBook (PC off), device index 1
Ceiling fan off, door closed, nobody else in room
Operator/walker: Avik, solo (spoken countdown in run_trial.py)

## Sound
Clip: Cummins Diesel Engine Sound Idling For Sleeping 12 Hours (steady engine, no revving), looped
Phone: Iphone 15 , volume Max (locked, do not change)
Phone held at desk height, speaker pointed at board
Calibration (live_check): peak at B = 0.28, level at B = -24.5 dBFS; level at A = ___ dBFS, quiet room = -64 dBFS
## Floor marks (from center of board's room-facing edge)
A, approach start: 117 in back
B, approach end: 20 in back
C, cross start: 57 in back, 75 in left
D, cross end: 57 in back, 42 in right
Approach = A to B. Cross = C to D or D to C (alternating).
Pace: normal walk, about 1 m/s, same every trial
Recording length: 6 s per trial

## Pass rule (set before testing)
Approach flagged in at least 5 of 6 approach trials AND at most 1 false flag in 12 crossing trials -> ship L0.
Anything worse -> ship L1 (ALERT_ENABLED = False).

## Void rules (set before testing)
A trial is VOID only if, during recording:
1. Extra noise: talking, door, other footsteps, any notification sound
2. Clip interrupted: stops, skips, gap at loop, or volume changes
3. Wrong path: start more than about 1 ft off the mark, wrong end point, or walk not finished before recording ends
4. Phone handling: dropped, bumped, covered, or pointed away from the board for more than a moment
5. Recording problem: script error or overflows > 0
6. Late start: not at the mark and moving within about 1 s of "go"
Never void because of a FAIL or a surprising result. Call the void before reading RESULT.
Voided trial: log reason, keep its files, rerun as <name>b. Max 3 voids total, then stop and fix the setup.

## Trials
Format: result, first flag time, notes

approach_1 (A to B): Pass, 3.168 s, none
approach_2 (A to B): Pass, 3.2 s, none
approach_3 (A to B): Pass, 3.328 s, none
approach_4 (A to B): Pass, 3.232 s, none
approach_5 (A to B): VOID (Walked faster than declared pace). Flag fired at 2.98 s
approach_5b (Second run): Pass, 3.328 s, none
approach_6 (A to B): Pass, 3.392, none

cross_1 (C to D): Pass, never, none
cross_2 (D to C): Pass, never, none
cross_3 (C to D): Pass, never, none
cross_4 (D to C): Pass, never, none
cross_5 (C to D): Pass, never, none
cross_6 (D to C): Pass, never, none
cross_7 (C to D): Pass, never, none
cross_8 (D to C): Pass, never, none
cross_9 (C to D): Pass, never, none
cross_10 (D to C): Pass, never, none
cross_11 (C to D): Pass, never, none
cross_12 (D to C): Pass, never, none

Reruns:

## Result
Approaches flagged: 6 / 6
Crossing false flags: 0 / 12
Voids: 1
Decision: ship L0
Notes: Development runs before the trials: test_approach_1/2 (setup), dev_1, dev_2 (approach), dev_c1-c3 (cross). Tracker values tuned on those, frozen, then 18 fresh trials. Flag fires ~3.2-3.4 s into the approach, about 0.5-1 m from the board.