# TSNBE–GH11 bridge reconciliation

The GH11 reference archive is now installed as `gh11-greenberg-handbook-neurosurgery-11e` and is ready for runtime search. The preserved bridge is `library/bridges/TSNBE_GH11_topic_bridge_v4.zip`.

The bridge contains 2,187 proposed TSNBE question links and references `TSNBE:*` question IDs. A repository scan of the current `question-bank-neurosurgery-integrated` source found no `TSNBE:` IDs; its current adapter-normalized source contains 2,354 questions under a different identity scheme. Therefore the bridge is **not automatically registered as runtime links**. Applying it by title or ordinal would risk attaching evidence to the wrong questions.

The bridge is preserved for audit and future reconciliation. To activate it safely, supply the matching TSNBE question package or an explicit, source-provenance-preserving ID map. Until then, GH11 topic suggestions and evidence passages remain navigational candidates; none is treated as verified answer-level clinical support.
