/**
 * Neurosurgery topic taxonomy used by both the offline keyword tagger and the
 * Claude tagger (Claude is asked to pick topic/subtopic from this list so tags
 * stay consistent across books).
 */
export interface TopicDef {
  topic: string;
  subtopics: Record<string, string[]>; // subtopic -> keywords
  keywords: string[];
}

export const TAXONOMY: TopicDef[] = [
  {
    topic: "Neuroanatomy",
    keywords: ["anatomy", "nucleus", "tract", "fasciculus", "gyrus", "sulcus", "cistern", "foramen"],
    subtopics: {
      "Cerebral cortex & white matter": ["cortex", "gyrus", "sulcus", "arcuate", "corpus callosum", "internal capsule", "brodmann"],
      "Brainstem & cranial nerves": ["brainstem", "pons", "medulla", "midbrain", "cranial nerve", "oculomotor", "trigeminal", "facial nerve", "abducens", "vagus", "hypoglossal"],
      "Cerebrovascular anatomy": ["circle of willis", "ica", "mca", "aca", "pca", "basilar", "vertebral artery", "venous sinus", "vein of galen"],
      "Skull base anatomy": ["cavernous sinus", "clivus", "petrous", "jugular foramen", "sella", "foramen ovale", "foramen magnum"],
      "Spinal anatomy": ["vertebra", "pedicle", "lamina", "facet", "spinal cord anatomy", "dermatome", "myotome", "conus"],
      "Ventricles & CSF": ["ventricle", "foramen of monro", "aqueduct", "choroid plexus", "csf production"]
    }
  },
  {
    topic: "Neurophysiology & Neurology",
    keywords: ["physiology", "neurology"],
    subtopics: {
      "Intracranial pressure & CBF": ["intracranial pressure", "icp", "cerebral perfusion", "cpp", "autoregulation", "monro-kellie", "cerebral blood flow"],
      "Neuro-ophthalmology": ["visual field", "papilledema", "hemianopia", "pupil", "nystagmus", "diplopia"],
      "Localisation & syndromes": ["aphasia", "neglect", "syndrome", "hemiparesis", "ataxia", "gerstmann", "wallenberg", "weber"],
      "Neurophysiology & monitoring": ["eeg", "emg", "ssep", "mep", "evoked potential", "neuromonitoring", "nerve conduction"],
      "Coma & brain death": ["coma", "brain death", "gcs", "glasgow coma", "herniation"]
    }
  },
  {
    topic: "Neuroradiology",
    keywords: ["mri", "ct", "angiography", "imaging", "radiograph", "t1", "t2", "flair", "dwi"],
    subtopics: {
      "CT & MRI interpretation": ["mri", "ct scan", "flair", "dwi", "adc", "gadolinium", "enhancement", "t1-weighted", "t2-weighted"],
      "Angiography": ["angiogram", "dsa", "cta", "mra"],
      "Advanced imaging": ["spectroscopy", "perfusion", "pet", "tractography", "dti", "fmri"]
    }
  },
  {
    topic: "Neuro-oncology",
    keywords: ["tumor", "tumour", "neoplasm", "oncology", "who grade", "resection", "radiotherapy", "chemotherapy"],
    subtopics: {
      "Gliomas": ["glioma", "glioblastoma", "gbm", "astrocytoma", "oligodendroglioma", "idh", "1p/19q", "mgmt", "temozolomide", "ependymoma"],
      "Meningiomas": ["meningioma", "simpson grade", "dural tail"],
      "Metastases": ["metastasis", "metastases", "metastatic"],
      "Sellar & pituitary tumours": ["pituitary", "adenoma", "prolactinoma", "acromegaly", "cushing", "craniopharyngioma", "rathke", "transsphenoidal", "apoplexy"],
      "Skull base tumours": ["vestibular schwannoma", "acoustic neuroma", "chordoma", "chondrosarcoma", "esthesioneuroblastoma", "glomus", "paraganglioma", "schwannoma"],
      "Paediatric brain tumours": ["medulloblastoma", "pilocytic", "dipg", "atrt", "germinoma", "pineal", "choroid plexus papilloma"],
      "Spinal tumours": ["intramedullary", "extramedullary", "spinal cord tumor", "spinal metastasis", "nerve sheath tumor"],
      "CNS lymphoma & other": ["lymphoma", "hemangioblastoma", "von hippel", "neurofibromatosis", "tuberous sclerosis", "epidermoid", "dermoid", "colloid cyst"]
    }
  },
  {
    topic: "Cerebrovascular",
    keywords: ["vascular", "hemorrhage", "haemorrhage", "stroke", "aneurysm", "avm"],
    subtopics: {
      "Aneurysms & SAH": ["aneurysm", "subarachnoid", "sah", "vasospasm", "hunt and hess", "fisher", "wfns", "clipping", "coiling", "flow diverter"],
      "Vascular malformations": ["avm", "arteriovenous malformation", "cavernoma", "cavernous malformation", "spetzler-martin", "dural arteriovenous fistula", "davf", "developmental venous anomaly", "capillary telangiectasia"],
      "Ischaemic stroke": ["ischemic stroke", "ischaemic stroke", "thrombectomy", "thrombolysis", "carotid endarterectomy", "carotid stenosis", "decompressive craniectomy", "malignant mca"],
      "Intracerebral haemorrhage": ["intracerebral hemorrhage", "intracerebral haemorrhage", "ich", "hypertensive hemorrhage", "amyloid angiopathy"],
      "Moyamoya & bypass": ["moyamoya", "bypass", "sta-mca", "revascularization"],
      "Venous disease": ["venous sinus thrombosis", "cerebral venous thrombosis", "cvst"]
    }
  },
  {
    topic: "Neurotrauma",
    keywords: ["trauma", "injury", "tbi", "fracture"],
    subtopics: {
      "Traumatic brain injury": ["traumatic brain injury", "tbi", "diffuse axonal", "contusion", "concussion", "brain trauma foundation"],
      "Extra-axial haematomas": ["epidural hematoma", "extradural", "subdural hematoma", "chronic subdural", "acute subdural", "burr hole"],
      "Skull fractures & CSF leak": ["skull fracture", "depressed fracture", "csf leak", "csf rhinorrhea", "basilar skull fracture"],
      "Spinal cord injury": ["spinal cord injury", "asia", "central cord", "brown-sequard", "anterior cord", "spinal shock", "neurogenic shock"],
      "Spinal trauma & fractures": ["odontoid", "hangman", "jefferson", "burst fracture", "chance fracture", "tlics", "slic", "atlanto", "occipital condyle"],
      "Peripheral nerve injury": ["seddon", "sunderland", "neurapraxia", "axonotmesis", "neurotmesis", "brachial plexus injury"]
    }
  },
  {
    topic: "Spine",
    keywords: ["spine", "spinal", "disc", "radiculopathy", "myelopathy", "fusion"],
    subtopics: {
      "Degenerative cervical spine": ["cervical myelopathy", "cervical radiculopathy", "acdf", "cervical spondylosis", "opll", "laminoplasty"],
      "Degenerative lumbar spine": ["lumbar disc", "sciatica", "lumbar stenosis", "spondylolisthesis", "cauda equina", "microdiscectomy", "neurogenic claudication"],
      "Spinal deformity": ["scoliosis", "kyphosis", "sagittal balance", "pelvic incidence", "deformity"],
      "Spinal infection & inflammation": ["discitis", "spinal epidural abscess", "osteomyelitis", "pott", "rheumatoid", "ankylosing spondylitis"],
      "Craniovertebral junction": ["chiari", "basilar invagination", "atlantoaxial", "craniovertebral", "syrinx", "syringomyelia"],
      "Instrumentation & biomechanics": ["pedicle screw", "instrumentation", "biomechanics", "interbody", "tlif", "plif", "alif", "xlif", "denis"]
    }
  },
  {
    topic: "Paediatric Neurosurgery",
    keywords: ["pediatric", "paediatric", "child", "infant", "neonate", "congenital"],
    subtopics: {
      "Hydrocephalus (paediatric)": ["congenital hydrocephalus", "aqueductal stenosis", "dandy-walker", "shunt in children"],
      "Spinal dysraphism": ["myelomeningocele", "spina bifida", "tethered cord", "lipomyelomeningocele", "dermal sinus", "neural tube defect"],
      "Craniosynostosis & craniofacial": ["craniosynostosis", "sagittal synostosis", "plagiocephaly", "scaphocephaly", "crouzon", "apert"],
      "Chiari & developmental": ["chiari ii", "encephalocele", "arachnoid cyst", "vein of galen malformation", "hydranencephaly"]
    }
  },
  {
    topic: "Hydrocephalus & CSF disorders",
    keywords: ["hydrocephalus", "shunt", "csf"],
    subtopics: {
      "Shunts & ETV": ["ventriculoperitoneal", "vp shunt", "etv", "endoscopic third ventriculostomy", "shunt malfunction", "shunt infection", "evd", "external ventricular drain"],
      "Normal pressure hydrocephalus": ["normal pressure hydrocephalus", "nph", "hakim", "tap test", "lumbar drain trial"],
      "Idiopathic intracranial hypertension": ["idiopathic intracranial hypertension", "pseudotumor", "iih"]
    }
  },
  {
    topic: "Functional & Epilepsy",
    keywords: ["functional", "stereotactic", "epilepsy", "seizure", "movement disorder"],
    subtopics: {
      "Movement disorders & DBS": ["deep brain stimulation", "dbs", "parkinson", "essential tremor", "dystonia", "subthalamic", "globus pallidus", "vim"],
      "Epilepsy surgery": ["epilepsy surgery", "temporal lobectomy", "amygdalohippocampectomy", "mesial temporal sclerosis", "corpus callosotomy", "vagus nerve stimulation", "seeg", "hemispherectomy", "laser ablation"],
      "Pain & neuromodulation": ["trigeminal neuralgia", "microvascular decompression", "spinal cord stimulation", "cordotomy", "drez", "intrathecal pump", "hemifacial spasm"],
      "Spasticity": ["spasticity", "selective dorsal rhizotomy", "baclofen"],
      "Radiosurgery": ["radiosurgery", "gamma knife", "srs", "cyberknife", "stereotactic radiosurgery"]
    }
  },
  {
    topic: "Peripheral Nerve",
    keywords: ["peripheral nerve", "plexus", "entrapment"],
    subtopics: {
      "Entrapment neuropathies": ["carpal tunnel", "cubital tunnel", "ulnar nerve", "median nerve", "tarsal tunnel", "meralgia", "entrapment"],
      "Brachial plexus": ["brachial plexus", "erb", "klumpke", "nerve transfer", "thoracic outlet"],
      "Nerve tumours": ["peripheral nerve sheath tumor", "mpnst", "neurofibroma"]
    }
  },
  {
    topic: "Infection & Inflammation",
    keywords: ["infection", "abscess", "meningitis"],
    subtopics: {
      "Brain abscess & empyema": ["brain abscess", "subdural empyema", "epidural abscess"],
      "Meningitis & ventriculitis": ["meningitis", "ventriculitis", "post-operative infection"],
      "Parasitic & granulomatous": ["neurocysticercosis", "tuberculoma", "hydatid", "toxoplasmosis", "fungal"]
    }
  },
  {
    topic: "Neurocritical Care & Perioperative",
    keywords: ["icu", "critical care", "perioperative", "anesthesia", "anaesthesia"],
    subtopics: {
      "Sodium & endocrine": ["siadh", "diabetes insipidus", "cerebral salt wasting", "hyponatremia", "hypernatremia"],
      "ICP management": ["hyperosmolar", "mannitol", "hypertonic saline", "barbiturate", "hyperventilation", "icp monitor"],
      "Anaesthesia & positioning": ["anesthesia", "anaesthesia", "air embolism", "prone position", "sitting position", "awake craniotomy"],
      "Complications & VTE": ["dvt", "venous thromboembolism", "post-operative complication", "seizure prophylaxis", "coagulopathy"]
    }
  },
  {
    topic: "Neuropathology",
    keywords: ["histology", "pathology", "histopathology", "immunohistochemistry", "molecular"],
    subtopics: {
      "Tumour pathology & genetics": ["rosenthal fibers", "psammoma", "homer wright", "pseudopalisading", "who classification", "molecular marker", "gfap", "ki-67", "codeletion"],
      "Non-tumour pathology": ["demyelination", "neurodegeneration", "prion", "amyloid"]
    }
  },
  {
    topic: "Operative Techniques & Approaches",
    keywords: ["approach", "craniotomy", "technique", "surgical"],
    subtopics: {
      "Cranial approaches": ["pterional", "orbitozygomatic", "retrosigmoid", "far lateral", "interhemispheric", "suboccipital", "subtemporal", "translabyrinthine", "bifrontal"],
      "Endoscopic & minimally invasive": ["endoscopic", "endonasal", "keyhole", "minimally invasive", "tubular retractor"],
      "Intraoperative adjuncts": ["neuronavigation", "intraoperative mri", "5-ala", "fluorescein", "ultrasound", "awake mapping", "cortical mapping"]
    }
  },
  {
    topic: "Ethics, Statistics & Trials",
    keywords: ["trial", "study", "statistics", "consent", "ethics"],
    subtopics: {
      "Landmark trials": ["isat", "barrow ruptured aneurysm", "stich", "mistie", "rescueicp", "decra", "aruba", "nascet", "crash", "best trip"],
      "Statistics & evidence": ["sensitivity", "specificity", "odds ratio", "confidence interval", "p value", "randomized", "level of evidence"],
      "Ethics & medicolegal": ["consent", "capacity", "ethics", "medicolegal"]
    }
  }
];

export const TOPICS = TAXONOMY.map((t) => t.topic);

export function subtopicsOf(topic: string): string[] {
  return Object.keys(TAXONOMY.find((t) => t.topic === topic)?.subtopics ?? {});
}

/** Compact text version of the taxonomy for the Claude system prompt. */
export function taxonomyText(): string {
  return TAXONOMY.map((t) => `- ${t.topic}\n${Object.keys(t.subtopics).map((s) => `    - ${s}`).join("\n")}`).join("\n");
}

function count(text: string, kw: string): number {
  // word-boundary match for short keywords (e.g. "ich", "sah"), substring otherwise
  if (kw.length <= 4) {
    const re = new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    return (text.match(re) ?? []).length;
  }
  let n = 0;
  let i = text.indexOf(kw);
  while (i !== -1) {
    n++;
    i = text.indexOf(kw, i + kw.length);
  }
  return n;
}

export interface LocalTagResult {
  topic: string;
  subtopic: string;
  tags: string[];
  keywords: string[];
}

/** Fast offline keyword tagger (used when no API key or as a first pass). */
export function localTag(text: string): LocalTagResult {
  const t = text.toLowerCase();
  let best = { topic: "Uncategorised", subtopic: "", score: 0 };
  const hits: string[] = [];
  const subScores: { topic: string; sub: string; score: number }[] = [];
  for (const def of TAXONOMY) {
    let topicScore = def.keywords.reduce((s, k) => s + count(t, k), 0) * 0.5;
    for (const [sub, kws] of Object.entries(def.subtopics)) {
      let s = 0;
      for (const k of kws) {
        const c = count(t, k);
        if (c) {
          s += c * (1 + k.length / 12);
          hits.push(k);
        }
      }
      subScores.push({ topic: def.topic, sub, score: s });
      topicScore += s;
    }
    if (topicScore > best.score) {
      const topSub = subScores.filter((x) => x.topic === def.topic).sort((a, b) => b.score - a.score)[0];
      best = { topic: def.topic, subtopic: topSub && topSub.score > 0 ? topSub.sub : "", score: topicScore };
    }
  }
  const tags = subScores
    .filter((s) => s.score >= 1.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((s) => s.sub);
  return { topic: best.topic, subtopic: best.subtopic, tags, keywords: Array.from(new Set(hits)).slice(0, 10) };
}
