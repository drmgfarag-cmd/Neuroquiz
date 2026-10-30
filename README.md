# NeuroQuiz161 remote Windows QA only

This disposable QA branch tests the exact locally rebuilt161 installer. It is not an application source branch and must never be merged into main. The application continues to run offline; GitHub is used only as a remote Windows test machine.

The workflow reconstructs the exact approved installer from SHA256-checked parts, verifies the independently bound acceptance runner, and performs a fresh installed Windows run. It never builds an application from main, old branches or repository source. Only the exact push branch triggers this workflow; no pull request or release tag is created.

The installer contains recoverable current application runtime code. Publishing these inputs in this public repository requires explicit owner approval. The inputs contain no source books/media/PDF archives, signing/provider keys or learner records. Test data is synthetic.

A standard Windows runner is used with a45-minute limit. No cache, artifact upload, paid runner, billing change or repository setting change is used. Bounded actual evidence is streamed to ordinary job logs; limits or missing evidence remain explicit. Functional completion does not close the213 attended/native criteria or establish full Windows acceptance.
