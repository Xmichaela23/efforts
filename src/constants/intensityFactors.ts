export const INTENSITY_FACTORS = {
  run: {
    easypace: 0.65,
    warmup_run_easy: 0.65,
    cooldown_easy: 0.65,
    longrun_easypace: 0.70,
    '5kpace_plus1:00': 0.85,
    '5kpace_plus0:50': 0.87,
    '5kpace_plus0:45': 0.88,
    '5kpace_plus0:35': 0.90,
    '5kpace': 0.95,
    '10kpace': 0.90,
    marathon_pace: 0.82,
    speed: 1.10,
    strides: 1.05,
    interval: 0.95,
    tempo: 0.88,
    cruise: 0.88
  },
  bike: {
    Z1: 0.55,
    recovery: 0.55,
    Z2: 0.70,
    endurance: 0.70,
    warmup_bike: 0.60,
    cooldown_bike: 0.60,
    tempo: 0.80,
    ss: 0.90,
    thr: 1.00,
    vo2: 1.15,
    anaerobic: 1.20,
    neuro: 1.10
  },
  swim: {
    warmup: 0.60,
    cooldown: 0.60,
    drill: 0.50,
    easy: 0.65,
    aerobic: 0.75,
    pull: 0.70,
    kick: 0.75,
    threshold: 0.95,
    interval: 1.00
  },
  strength: {
    '@pct60': 0.70,
    '@pct65': 0.75,
    '@pct70': 0.80,
    '@pct75': 0.85,
    '@pct80': 0.90,
    '@pct85': 0.95,
    '@pct90': 1.00,
    main_: 0.85,
    acc_: 0.70,
    core_: 0.60,
    bodyweight: 0.65
  }
};
