# Decisions

One line each: date, decision, who.

- 2026-10-04: GCC output contract between bearing.py and srp.py locked (spec 5.2). Avik, Srihaas.
- 2026-10-05: Added MAX_LAG_SAMPLES = 4.4 to the Bearing section of config. Avik.
- 2026-10-05: Added empty root conftest.py so plain `pytest` can import dac. Avik.
- 2026-10-08: Finding: provisional tracker thresholds do not flag an approach before 3 m on the synthetic 6 m→1 m walk (LEVEL_MARGIN_DB=10 binds; flag never fires before 1 m). Test T4 marked xfail until S7 tuning. Srihaas.
- 2026-10-10: SRP confidence formula changed from (Pmax-meanP)/(Pmax-minP) to cross-pair peak agreement (spec 5.4, config CONF_AGREE_*): noise now scores 0 (95th pct 0.09) vs 0.84-0.95 for a clean source, so B4 passes and CONF_MIN stays 0.3. Srihaas, with Avik (his B4).
- 2026-10-25: LEVEL_MARGIN_DB 10 → 4 from calibration (A→B rise ~6.5 dB in test room). TREND_MIN_DBPS and RATE_MAX_DPS unchanged. Avik, Srihaas.
- 2026-10-25: Tracker values frozen for V4 from development walks in the test room (setup: test_approach_1/2; dev: dev_1, dev_2 approaches, dev_c1–c3 crossings): CONF_MIN 0.3 → 0.1, TREND_MIN_DBPS 3.0 → 1.5, LEVEL_MARGIN_DB 10 → 4.0. Reason: indoor A→B loudness rise ~7 dB vs ~15 dB free-field (reverb), and bearings were correct at confidence < 0.3. Dev results: 3/3 approaches flag (replay), 3/3 crossings no flag. V4 pass rule unchanged. Avik, Srihaas.
- 2026-10-25: V4 walk test PASSED: 6/6 approaches flagged (1 void for pace, rerun), 0/12 crossing false flags. Ship L0. Avik.