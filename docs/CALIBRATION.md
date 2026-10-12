# Calibration and evaluation

No RLCD training is implemented. Calibration here is a replaceable **inference interface**, not an evidence-backed claim about the baseline.

The supported transform is `sigmoid(a * logit(h) + b)` where `h` is the bounded heuristic span correctness estimate and `a`, `b` are finite caller-supplied parameters. `a=1,b=0` is identity, not proof of calibration. Confidence estimates the correctness of the assigned span polarity/category under the caller's labeling convention; it does not measure emotional importance or overall sentiment probability.

To use responsibly:

1. Define labels precisely (span polarity correctness, or joint polarity/emotion correctness).
2. Collect representative labeled spans, including ambiguous and negative examples. Record the analyzer version.
3. Split by document/source into fitting and held-out sets, avoiding leakage.
4. Fit logistic parameters on the fitting set only; apply them via `calibration: {method:'platt', a, b}`.
5. Evaluate held-out Brier score `mean((p-y)^2)`, log loss `-mean(y log(p)+(1-y)log(1-p))` with clipping, and expected calibration error using predeclared bins and sample counts.
6. Report sample size, class balance, bootstrap uncertainty, baseline comparison, and abstention coverage/accuracy. Retest after lexicon/context changes or domain shifts.

This repository supplies neither fitted calibration parameters nor labeled evaluation data, so it reports no calibration-quality metrics. `metadata.calibrated=true` means **external parameters were applied**, not that they have passed validation. Overall sentiment distributions remain heuristic even then. The current confidence features have very few distinct values; a richer analyzer is preferable for fine-grained confidence ranking.