;;; organice-horizons.el --- ORGanice: horizontes de GTD (horizons.org) como en la app  -*- lexical-binding: t; -*-

;; (4.17) Como la app (4.07 y 4.16), en el fichero `organice-horizons-file' (horizons.org):
;;   * Propósito y principios   (el texto de debajo)
;;   * Visión (3–5 años)        (el texto de debajo)
;;   * Objetivos (1–2 años)     (cada «**» es un objetivo, con :ID:, :AREA: y :PLAZO:)
;;   * Áreas de responsabilidad (cada «**» es un valor de :AREA:)
;; Un proyecto apunta a su objetivo con «:OBJETIVO: [[id:…][Título]]» (como :PROYECTO:); si no
;; tiene área, toma la del objetivo. :PLAZO: = Este trimestre, Este año o 1–2 años.
;;
;; C-c g H  vista Horizontes: objetivos por plazo y áreas, cada uno con sus proyectos (⚠ = ningún
;;          proyecto activo) y, aparte, los proyectos sin objetivo ni área. Arriba, los avisos de
;;          las frecuencias oficiales de revisión.
;; C-c g O  objetivo del proyecto del punto (C-u: quitarlo) · C-c g L plazo del objetivo del punto.

(require 'org)
(require 'org-id)
(require 'organice-core)
(require 'organice-gtd)
(require 'organice-proc)
(require 'organice-allen-data)

(declare-function organice-plan-project "organice-allen")

(defconst organice-horizons-template
  "#+TITLE: Horizontes

* Propósito y principios
Por qué haces lo que haces y qué es importante para ti.
* Visión (3–5 años)
Cómo te gustaría que fuera tu vida y tu trabajo dentro de unos años.
* Objetivos (1–2 años)
* Áreas de responsabilidad
** Trabajo
** Casa
** Salud
** Familia
** Dinero
"
  "Plantilla del fichero de horizontes nuevo (la misma que la app).")

(defconst organice-horizon-terms '(("Este trimestre" . quarter) ("Este año" . year) ("1–2 años" . 2y))
  "Plazos de los objetivos (:PLAZO:), en su orden.")

(defun organice-horizon-term-of (value)
  "Del texto de :PLAZO: al plazo (admite variantes, como la app)."
  (let ((v (downcase (string-trim (or value "")))))
    (cond ((string-empty-p v) nil)
          ((string-match-p "trimestre\\|quarter\\|\\`q[0-9]?\\'" v) 'quarter)
          ((string-match-p "2\\|dos\\|years?\\|años" v) '2y)
          ((string-match-p "año\\|year" v) 'year))))

(defun organice-horizon-kind (title)
  (let ((v (downcase (or title ""))))
    (cond ((string-match-p "prop[oó]sito\\|principio" v) 'purpose)
          ((string-match-p "visi[oó]n" v) 'vision)
          ((string-match-p "objetivo\\|meta" v) 'goals)
          ((string-match-p "[aá]rea\\|responsabilidad" v) 'areas))))

(defun organice-horizons--ensure-file (&optional no-ask)
  "Buffer de horizons.org; si no existe, pregunta si crearlo con la plantilla (como la app)."
  (let ((path (organice-horizons-path)))
    (unless (file-exists-p path)
      (unless (or no-ask (y-or-n-p (format "No existe %s. ¿Crearlo con la plantilla? "
                                           organice-horizons-file)))
        (user-error "Sin fichero de horizontes"))
      (with-temp-file path (insert organice-horizons-template))
      (organice-refresh-agenda-files))
    (find-file-noselect path)))

(defun organice-horizons-parse ()
  "Lo que hay en horizons.org: plist :purpose :vision :goals :areas (marcadores de las cabeceras
de primer nivel), :objectives (marcadores) y :area-list (marcadores)."
  (let (out objectives areas section section-level)
    (when (file-exists-p (organice-horizons-path))
      (with-current-buffer (find-file-noselect (organice-horizons-path))
        (org-with-wide-buffer
         (org-map-entries
          (lambda ()
            (let ((lv (org-outline-level)))
              (if (= lv 1)
                  (let ((k (organice-horizon-kind (org-get-heading t t t t))))
                    (setq section (and k (not (plist-get out (intern (format ":%s" k)))) k) section-level lv)
                    (when section (setq out (plist-put out (intern (format ":%s" section)) (point-marker)))))
                (when (and section (= lv (1+ section-level)) (not (organice--trashed-p)))
                  (pcase section
                    ('goals (push (point-marker) objectives))
                    ('areas (push (point-marker) areas)))))))
          nil 'file))))
    (plist-put (plist-put out :objectives (nreverse objectives)) :area-list (nreverse areas))))

(defun organice--link-id (value)
  (when (and value (string-match "\\[\\[id:\\([^]]+\\)\\]" value)) (string-trim (match-string 1 value))))

(defun organice-projects ()
  "Marcadores de los PROJECT sin terminar (no en la Papelera) de los ficheros de la agenda."
  (organice-collect (lambda () (and (organice--project-p) (not (organice--done-p))))))

(defun organice--project-alive-p (m) (organice-at m (eq (organice-project-state) 'active)))

(defun organice-horizons-view-data ()
  "Plist :objectives ((OBJ . PROYECTOS) …) :areas ((ÁREA . PROYECTOS) …) :loose PROYECTOS."
  (let* ((h (organice-horizons-parse))
         (projects (organice-projects))
         (objs (seq-remove (lambda (o) (organice-at o (organice--done-p))) (plist-get h :objectives)))
         (ids (mapcar (lambda (o) (organice-at o (org-entry-get (point) "ID"))) objs))
         (linked nil)
         (by-obj (mapcar (lambda (o)
                           (let ((id (organice-at o (org-entry-get (point) "ID"))))
                             (cons o (and id
                                          (organice-sort-by-title
                                           (seq-filter
                                            (lambda (p)
                                              (let ((ref (organice-at p (organice--link-id
                                                                         (org-entry-get (point) "OBJETIVO")))))
                                                (when (and ref (equal (downcase ref) (downcase id)))
                                                  (push p linked) t)))
                                            projects))))))
                         objs))
         (area-names (mapcar (lambda (a) (downcase (organice-title a))) (plist-get h :area-list)))
         (by-area (mapcar (lambda (a)
                            (cons a (organice-sort-by-title
                                     (seq-filter (lambda (p)
                                                   (equal (downcase (or (organice-at p (org-entry-get (point) "AREA" t)) ""))
                                                          (downcase (organice-title a))))
                                                 projects))))
                          (plist-get h :area-list)))
         (loose (organice-sort-by-title
                 (seq-remove (lambda (p)
                               (or (memq p linked)
                                   (member (downcase (or (organice-at p (org-entry-get (point) "AREA" t)) ""))
                                           area-names)))
                             projects))))
    (ignore ids)
    (list :h h :objectives by-obj :areas by-area :loose loose)))

(defun organice-missing-areas ()
  "Áreas usadas en tareas abiertas que no están en horizons.org."
  (let* ((names (mapcar (lambda (a) (downcase (organice-title a)))
                        (plist-get (organice-horizons-parse) :area-list)))
         (used nil))
    (dolist (m (organice-collect (lambda () (and (organice--kw) (not (organice--done-p))
                                                 (org-entry-get (point) "AREA" t)))))
      (let ((a (string-trim (organice-at m (org-entry-get (point) "AREA" t)))))
        (unless (or (string-empty-p a) (member (downcase a) names) (member a used))
          (push a used))))
    (sort used #'string-collate-lessp)))

;;;; Objetivo de un proyecto y plazo de un objetivo ---------------------------------------------

(defun organice--entry-marker ()
  (if (derived-mode-p 'org-agenda-mode)
      (or (org-get-at-bol 'org-hd-marker) (user-error "Ponte en una tarea"))
    (save-excursion (org-back-to-heading t) (point-marker))))

(defun organice-set-objective (&optional remove)
  "Elige el objetivo (de horizons.org) del proyecto del punto; con C-u, lo quita.
Se guarda como «:OBJETIVO: [[id:…][Título]]»; si el proyecto no tiene área, toma la del objetivo."
  (interactive "P")
  (let ((p (organice--entry-marker)))
    (unless (organice-at p (organice--project-p)) (user-error "Ponte en un PROJECT"))
    (if remove
        (progn (organice-at p (org-entry-delete (point) "OBJETIVO")) (organice-save p)
               (message "Objetivo quitado"))
      (organice-horizons--ensure-file)
      (let* ((objs (seq-remove (lambda (o) (organice-at o (organice--done-p)))
                               (plist-get (organice-horizons-parse) :objectives)))
             (cands (mapcar (lambda (o) (cons (organice-title o) o)) objs)))
        (unless cands (user-error "No hay objetivos en %s (C-c g H › ＋ Objetivo)" organice-horizons-file))
        (let* ((o (cdr (assoc (completing-read "Objetivo del proyecto: " cands nil t) cands)))
               (id (organice-at o (prog1 (org-id-get-create) (save-buffer))))
               (title (replace-regexp-in-string "[][]" "" (organice-title o)))
               (area (organice-at o (org-entry-get (point) "AREA"))))
          (organice-at p
            (org-entry-put (point) "OBJETIVO" (format "[[id:%s][%s]]" id title))
            (when (and area (not (org-entry-get (point) "AREA" t)))
              (org-entry-put (point) "AREA" area)))
          (organice-save p)
          (message "Objetivo: %s" title))))))

(defun organice--read-term ()
  (let ((c (completing-read "Plazo: " (append (mapcar #'car organice-horizon-terms) '("(sin plazo)")) nil t)))
    (unless (equal c "(sin plazo)") c)))

(defun organice-set-term (&optional m)
  "Plazo (:PLAZO:) del objetivo del punto (o de M)."
  (interactive)
  (let ((m (or m (organice--entry-marker)))
        (term (organice--read-term)))
    (organice-at m (if term (org-entry-put (point) "PLAZO" term) (org-entry-delete (point) "PLAZO")))
    (organice-save m)
    "Plazo"))

(defun organice-add-objective ()
  "Objetivo nuevo en horizons.org, con su :ID:, :AREA: y :PLAZO:."
  (interactive)
  (organice-horizons--ensure-file)
  (let* ((h (organice-horizons-parse))
         (goals (or (plist-get h :goals) (user-error "Falta «* Objetivos (1–2 años)» en %s" organice-horizons-file)))
         (title (read-string "Objetivo nuevo: "))
         (areas (mapcar #'organice-title (plist-get h :area-list)))
         (area (completing-read "Área (vacío = ninguna): " areas nil nil))
         (term (organice--read-term)))
    (unless (string-empty-p (string-trim title))
      (let ((m (organice-add-child goals (string-trim title))))
        (organice-at m
          (org-id-get-create)
          (unless (string-empty-p area) (org-entry-put (point) "AREA" area))
          (when term (org-entry-put (point) "PLAZO" term))
          (save-buffer))
        (message "Objetivo añadido: %s" title)))))

(defun organice-add-area (&optional name)
  "Área nueva en horizons.org."
  (interactive)
  (organice-horizons--ensure-file)
  (let ((areas (or (plist-get (organice-horizons-parse) :areas)
                   (user-error "Falta «* Áreas de responsabilidad» en %s" organice-horizons-file)))
        (name (or name (read-string "Área nueva: "))))
    (unless (string-empty-p (string-trim name))
      (organice-at (organice-add-child areas (string-trim name)) (org-entry-delete (point) "CREATED") (save-buffer))
      (message "Área añadida: %s" name))))

;;;; Revisiones: cuándo se hizo cada una (frecuencias oficiales, 4.16) ----------------------------

(defvar organice-reviews-file (locate-user-emacs-file "organice-reviews.eld")
  "Fechas de la última revisión de cada nivel: ((weekly . \"2026-10-24\") (areas . …) …).")

(defun organice-reviews-get ()
  (when (file-exists-p organice-reviews-file)
    (with-temp-buffer (insert-file-contents organice-reviews-file)
                      (ignore-errors (read (current-buffer))))))

(defun organice-reviews-mark (level)
  "Apunta que hoy se ha revisado LEVEL (weekly, areas, goals, vision, purpose)."
  (let ((v (assq-delete-all level (organice-reviews-get))))
    (push (cons level (format-time-string "%Y-%m-%d")) v)
    (with-temp-file organice-reviews-file (prin1 v (current-buffer)))))

(defun organice-reviews-days-since (level)
  (let ((d (alist-get level (organice-reviews-get))))
    (and d (- (org-today) (time-to-days (org-time-string-to-time d))))))

(defun organice-horizon-reminders ()
  "Avisos suaves con las frecuencias oficiales: proyectos cada semana (la Revisión semanal),
áreas cada mes, objetivos cada año con recalibrado trimestral."
  (let (out)
    (dolist (f '((weekly "Proyectos" "semanal" 7 nil)
                 (areas "Áreas" "mensual" 30 nil)
                 (goals "Objetivos" "anual (recalibrar cada trimestre)" 365 91)))
      (pcase-let ((`(,id ,label ,every ,days ,recal) f))
        (let ((since (organice-reviews-days-since id)))
          (cond ((or (null since) (>= since days))
                 (push (format "%s: revisión %s — %s" label every
                               (if since (format "la última hace %d días" since) "sin revisar aún"))
                       out))
                ((and recal (>= since recal))
                 (push (format "%s: toca recalibrar (hace %d días)" label since) out))))))
    (nreverse out)))

;;;; La vista ----------------------------------------------------------------------------------------

(defun organice--insert-projects (projects)
  (if (null projects)
      (insert (propertize "    (ningún proyecto)\n" 'face 'shadow))
    (dolist (p projects)
      (insert "    ")
      (insert-text-button (organice-title p) 'action (lambda (_) (organice-visit p)) 'follow-link t)
      (insert (propertize (pcase (organice-at p (organice-project-state))
                            ('sleep "  (dormido)") ('scheduled "  (programado)") (_ ""))
                          'face 'shadow)
              "\n"))))

(defun organice--insert-objective (o projects)
  (let ((empty (not (seq-some #'organice--project-alive-p projects)))
        (area (organice-at o (org-entry-get (point) "AREA"))))
    (insert "  " (if empty "⚠ " "◎ "))
    (insert-text-button (organice-title o) 'action (lambda (_) (organice-visit o)) 'follow-link t 'face 'bold)
    (insert (propertize (if area (format "  · %s" area) "") 'face 'shadow) "  ")
    (organice-proc--button "Plazo…" (lambda () (organice-set-term o) (organice-proc-refresh)))
    (when (fboundp 'organice-plan-project)
      (organice-proc--button "Planificar un proyecto" (lambda () (organice-plan-project o))))
    (insert "\n")
    (organice--insert-projects projects)))

(defun organice-horizons--insert-objectives (data)
  (let ((objs (plist-get data :objectives)))
    (insert (propertize "OBJETIVOS (1–2 AÑOS)" 'face 'organice-proc-step) "\n")
    (if (null objs)
        (insert (propertize "  Sin objetivos.\n" 'face 'shadow))
      (dolist (term (append organice-horizon-terms '(("Sin plazo" . nil))))
        (let ((items (seq-filter (lambda (op)
                                   (eq (organice-horizon-term-of (organice-at (car op) (org-entry-get (point) "PLAZO")))
                                       (cdr term)))
                                 objs)))
          (when items
            (insert (propertize (format " %s\n" (car term)) 'face 'shadow))
            (dolist (op items) (organice--insert-objective (car op) (cdr op)))))))
    (insert "\n")))

(defun organice-horizons--insert-areas (data &optional missing)
  (insert (propertize "ÁREAS DE RESPONSABILIDAD" 'face 'organice-proc-step) "\n")
  (dolist (ap (plist-get data :areas))
    (let ((empty (not (seq-some #'organice--project-alive-p (cdr ap)))))
      (insert "  " (if empty "⚠ " "▸ "))
      (insert-text-button (organice-title (car ap)) 'action (lambda (_) (organice-visit (car ap)))
                          'follow-link t 'face 'bold)
      (insert "\n")
      (organice--insert-projects (cdr ap))))
  (when missing
    (let ((ms (organice-missing-areas)))
      (when ms
        (insert "\n" (propertize "  Áreas que usas en tus tareas y faltan en el fichero:\n" 'face 'shadow) "  ")
        (dolist (a ms)
          (organice-proc--button (concat "＋ " a) (lambda () (organice-add-area a) (organice-proc-refresh))))
        (insert "\n"))))
  (insert "\n"))

(defun organice-horizons--insert ()
  (let ((data (organice-horizons-view-data))
        (rem (organice-horizon-reminders)))
    (when rem
      (dolist (r rem) (insert (propertize (concat "⏰ " r) 'face 'warning) "\n"))
      (insert "\n"))
    (organice-horizons--insert-objectives data)
    (organice-horizons--insert-areas data)
    (insert (propertize "PROYECTOS SIN OBJETIVO NI ÁREA" 'face 'organice-proc-step) "\n")
    (organice--insert-projects (plist-get data :loose))))

(defun organice-horizons ()
  "Vista Horizontes (4.07): objetivos y áreas con sus proyectos."
  (interactive)
  (organice-horizons--ensure-file)
  (organice-proc-start
   "Horizontes"
   (list (list :label (format "Fichero: %s" organice-horizons-file)
               :hint "⚠ = ningún proyecto activo lo mueve. RET en un nombre lo abre."
               :buttons (list (cons "＋ Objetivo" #'organice-add-objective)
                              (cons "＋ Área" #'organice-add-area)
                              (cons "Abrir el fichero" (lambda () (find-file-other-window (organice-horizons-path)))))
               :insert #'organice-horizons--insert))))

(defun organice--insert-section-text (kind)
  (let ((m (plist-get (organice-horizons-parse) (intern (format ":%s" kind)))))
    (if (not m)
        (insert (propertize "  (no está en el fichero)\n" 'face 'shadow))
      (let ((txt (organice-at m (let ((b (save-excursion (org-end-of-meta-data t) (point)))
                                      (e (save-excursion (org-end-of-subtree t t) (point))))
                                  (string-trim (buffer-substring-no-properties b e))))))
        (insert (if (string-empty-p txt) (propertize "  (vacío)" 'face 'shadow) txt) "\n\n")
        (organice-proc--button "Editar" (lambda () (organice-visit m)))
        (insert "\n")))))

(defun organice-horizons-review ()
  "Revisión de horizontes (4.07), de abajo arriba: áreas, objetivos, visión y propósito.
Cada paso cuenta como revisado al pasarlo (4.16)."
  (interactive)
  (organice-horizons--ensure-file)
  (organice-proc-start
   "Revisión de horizontes"
   (mapcar
    (lambda (s)
      (pcase-let ((`(,id ,label ,hint) s))
        (list :id id :label label :hint hint
              :on-leave (lambda () (organice-reviews-mark id))
              :buttons (pcase id
                         ('areas (list (cons "＋ Área" #'organice-add-area)))
                         ('goals (list (cons "＋ Objetivo" #'organice-add-objective))))
              :capture "Apuntar al Inbox"
              :insert (pcase id
                        ('areas (lambda () (organice-horizons--insert-areas (organice-horizons-view-data) t)))
                        ('goals (lambda () (organice-horizons--insert-objectives (organice-horizons-view-data))))
                        (_ (lambda () (organice--insert-section-text id)))))))
    organice-horizon-steps)))

(provide 'organice-horizons)
;;; organice-horizons.el ends here
