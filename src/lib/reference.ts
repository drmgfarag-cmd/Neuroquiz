/**
 * Quick reference while answering (like the lab-values panel in board exams):
 * adult normal values and the grading scales neurosurgery questions assume.
 * Ranges vary a little between laboratories.
 */
export interface RefTable {
  id: string;
  title: string;
  group: "Lab values" | "Physiology" | "Scales";
  columns: [string, string];
  rows: [string, string][];
  note?: string;
}

export const REFERENCE: RefTable[] = [
  {
    id: "serum",
    title: "Serum chemistry",
    group: "Lab values",
    columns: ["Test", "Adult normal"],
    rows: [
      ["Sodium", "135–145 mmol/L"],
      ["Potassium", "3.5–5.0 mmol/L"],
      ["Chloride", "98–106 mmol/L"],
      ["Bicarbonate", "22–28 mmol/L"],
      ["Urea (BUN)", "2.5–7.1 mmol/L (7–20 mg/dL)"],
      ["Creatinine", "60–110 µmol/L (0.7–1.2 mg/dL)"],
      ["Glucose, fasting", "3.9–5.5 mmol/L (70–100 mg/dL)"],
      ["Calcium, total", "2.2–2.6 mmol/L (8.5–10.5 mg/dL)"],
      ["Magnesium", "0.7–1.0 mmol/L"],
      ["Phosphate", "0.8–1.5 mmol/L"],
      ["Osmolality, serum", "275–295 mOsm/kg"],
      ["Osmolality, urine", "50–1200 mOsm/kg (random)"],
      ["Urine sodium", "> 40 mmol/L in SIADH/CSW with normal intake"],
      ["Albumin", "35–50 g/L"],
      ["CRP", "< 5 mg/L"],
      ["ESR", "≤ age/2 (men), ≤ (age + 10)/2 (women) mm/h"]
    ],
    note: "Calculated serum osmolality = 2 × Na + glucose + urea (mmol/L). Correct Na by no more than 8–10 mmol/L in 24 h in chronic hyponatraemia (osmotic demyelination)."
  },
  {
    id: "blood",
    title: "Haematology & coagulation",
    group: "Lab values",
    columns: ["Test", "Adult normal"],
    rows: [
      ["Haemoglobin", "M 13.5–17.5 g/dL · F 12.0–15.5 g/dL"],
      ["White cells", "4.0–11.0 × 10⁹/L"],
      ["Platelets", "150–400 × 10⁹/L"],
      ["INR", "0.8–1.2"],
      ["aPTT", "25–35 s"],
      ["Prothrombin time", "11–13.5 s"],
      ["Fibrinogen", "2–4 g/L"]
    ],
    note: "Common thresholds before elective cranial/spinal surgery: platelets > 100 × 10⁹/L, INR < 1.4 (local protocols vary)."
  },
  {
    id: "endo",
    title: "Pituitary & endocrine",
    group: "Lab values",
    columns: ["Test", "Normal / interpretation"],
    rows: [
      ["Prolactin", "< 20–25 ng/mL; > 150–200 ng/mL suggests prolactinoma; stalk effect usually < 100–150"],
      ["Cortisol, 8–9 am", "140–690 nmol/L (5–25 µg/dL); < 100 nmol/L suggests insufficiency"],
      ["ACTH", "~ 7–63 pg/mL"],
      ["GH after 75 g OGTT", "Nadir < 1 ng/mL (< 0.4 with sensitive assays) – no suppression in acromegaly"],
      ["IGF-1", "Age- and sex-specific range; raised in acromegaly"],
      ["Free T4", "10–22 pmol/L (0.8–1.8 ng/dL)"],
      ["TSH", "0.4–4.0 mU/L"],
      ["24 h urine free cortisol", "Above the assay's upper limit in Cushing's syndrome"],
      ["Low-dose dexamethasone", "Cortisol < 50 nmol/L (1.8 µg/dL) next morning is normal suppression"]
    ],
    note: "Diabetes insipidus: polyuria > 3 L/day (or > 250–300 mL/h for 2 h post-op), urine SG < 1.005, urine osm < 300 with rising serum Na."
  },
  {
    id: "csf",
    title: "Cerebrospinal fluid",
    group: "Physiology",
    columns: ["Measure", "Adult normal"],
    rows: [
      ["Opening pressure (lateral decubitus)", "10–20 cmH₂O (up to 25 in adults)"],
      ["Protein", "0.15–0.45 g/L (15–45 mg/dL)"],
      ["Glucose", "2.5–4.4 mmol/L; CSF : serum ratio ≈ 0.6"],
      ["White cells", "≤ 5 /µL, lymphocytes/monocytes"],
      ["Red cells", "0 (traumatic tap clears across tubes; xanthochromia after ~12 h in SAH)"],
      ["Production", "≈ 0.35 mL/min, ≈ 500 mL/day"],
      ["Total volume", "≈ 150 mL (≈ 25 mL in the ventricles)"]
    ]
  },
  {
    id: "icp",
    title: "Intracranial pressure & brain physiology",
    group: "Physiology",
    columns: ["Measure", "Value"],
    rows: [
      ["ICP, adult supine", "5–15 mmHg"],
      ["ICP treatment threshold (TBI)", "> 22 mmHg (Brain Trauma Foundation, 4th ed.)"],
      ["CPP", "CPP = MAP − ICP; target 60–70 mmHg in severe TBI"],
      ["Cerebral blood flow", "≈ 50 mL/100 g/min; neuronal dysfunction < 20; infarction < 10"],
      ["Autoregulation", "MAP ≈ 50/60–150 mmHg (shifted right in chronic hypertension)"],
      ["PaCO₂", "CBF changes ≈ 2–4% per mmHg between 20 and 80 mmHg"],
      ["Brain tissue O₂ (PbtO₂)", "Treat < 20 mmHg"],
      ["Jugular venous O₂ (SjvO₂)", "55–75%; < 50% = ischaemia"]
    ]
  },
  {
    id: "gcs",
    title: "Glasgow Coma Scale",
    group: "Scales",
    columns: ["Score", "Response"],
    rows: [
      ["E4 / E3 / E2 / E1", "Eyes open spontaneously / to sound / to pressure / none"],
      ["V5 / V4", "Oriented / confused"],
      ["V3 / V2 / V1", "Words / sounds / none"],
      ["M6 / M5 / M4", "Obeys commands / localises / normal flexion (withdraws)"],
      ["M3 / M2 / M1", "Abnormal flexion (decorticate) / extension (decerebrate) / none"],
      ["Severity", "Mild 13–15 · moderate 9–12 · severe 3–8"]
    ]
  },
  {
    id: "sah",
    title: "Subarachnoid haemorrhage",
    group: "Scales",
    columns: ["Grade", "Definition"],
    rows: [
      ["Hunt–Hess 1", "Asymptomatic or mild headache, slight nuchal rigidity"],
      ["Hunt–Hess 2", "Moderate–severe headache, nuchal rigidity, no deficit except cranial nerve palsy"],
      ["Hunt–Hess 3", "Drowsy, confused or mild focal deficit"],
      ["Hunt–Hess 4", "Stupor, moderate–severe hemiparesis, early decerebrate posturing"],
      ["Hunt–Hess 5", "Deep coma, decerebrate rigidity, moribund"],
      ["WFNS I", "GCS 15, no motor deficit"],
      ["WFNS II / III", "GCS 13–14 without / with motor deficit"],
      ["WFNS IV / V", "GCS 7–12 / GCS 3–6"],
      ["Modified Fisher 0", "No SAH, no IVH"],
      ["Modified Fisher 1 / 2", "Thin SAH without / with IVH"],
      ["Modified Fisher 3 / 4", "Thick SAH without / with IVH (highest vasospasm risk)"]
    ]
  },
  {
    id: "vasc",
    title: "Vascular malformations & ICH",
    group: "Scales",
    columns: ["Scale", "Points / grades"],
    rows: [
      ["Spetzler–Martin: size", "< 3 cm = 1 · 3–6 cm = 2 · > 6 cm = 3"],
      ["Spetzler–Martin: eloquence", "Non-eloquent = 0 · eloquent = 1"],
      ["Spetzler–Martin: venous drainage", "Superficial only = 0 · any deep = 1 (grade = sum, I–V)"],
      ["Borden I", "Dural AVF draining into a sinus/meningeal vein, antegrade"],
      ["Borden II", "Sinus drainage with cortical venous reflux"],
      ["Borden III", "Direct cortical venous drainage"],
      ["ICH score: GCS", "3–4 = 2 · 5–12 = 1 · 13–15 = 0"],
      ["ICH score: other items", "Volume ≥ 30 mL, IVH, infratentorial origin, age ≥ 80: 1 point each"],
      ["ICH score: 30-day mortality", "0: 0% · 1: 13% · 2: 26% · 3: 72% · 4: 97% · 5: 100%"]
    ],
    note: "ICH volume ≈ ABC/2 (cm, from CT)."
  },
  {
    id: "spine",
    title: "Spinal cord injury & spine",
    group: "Scales",
    columns: ["Grade", "Definition"],
    rows: [
      ["ASIA A", "Complete: no sensory or motor function in S4–S5"],
      ["ASIA B", "Sensory incomplete: sensation but no motor function below the level, including S4–S5"],
      ["ASIA C", "Motor incomplete: more than half of key muscles below the level < grade 3"],
      ["ASIA D", "Motor incomplete: at least half of key muscles below the level ≥ grade 3"],
      ["ASIA E", "Normal"],
      ["TLICS morphology", "Compression 1 · burst +1 · translation/rotation 3 · distraction 4"],
      ["TLICS neurology", "Intact 0 · root 2 · complete cord/conus 2 · incomplete cord/conus 3 · cauda equina 3"],
      ["TLICS PLC", "Intact 0 · indeterminate 2 · injured 3"],
      ["TLICS total", "≤ 3 non-operative · 4 either · ≥ 5 operative"]
    ]
  },
  {
    id: "outcome",
    title: "Function & outcome",
    group: "Scales",
    columns: ["Score", "Meaning"],
    rows: [
      ["mRS 0 / 1", "No symptoms / no significant disability"],
      ["mRS 2", "Slight disability: independent, cannot do all previous activities"],
      ["mRS 3", "Moderate disability: needs some help, walks unassisted"],
      ["mRS 4", "Moderately severe: cannot walk or attend to bodily needs unassisted"],
      ["mRS 5 / 6", "Severe disability, bedridden / dead"],
      ["Karnofsky 100–80", "Normal activity, able to work"],
      ["Karnofsky 70–50", "Unable to work; lives at home, cares for most needs with varying help"],
      ["Karnofsky 40–10", "Unable to care for self; needs institutional or hospital care"],
      ["GOS 1–5", "Death · vegetative · severe disability · moderate disability · good recovery"],
      ["House–Brackmann I–VI", "Normal · mild · moderate · moderately severe · severe dysfunction · total paralysis"]
    ]
  }
];
