;;; organice-allen.el --- ORGanice: los procesos de GTD fieles a David Allen  -*- lexical-binding: t; -*-

;; (4.17) Los mismos procesos que la app (Menú ☰ › Procesos) con «Allen estricto» (por defecto):
;;
;;   C-c g e   Procesos (elegir uno)
;;   C-c g I   Procesar Inbox (una a una, diagrama oficial «Clarifying»)
;;   C-c g v   Revisión diaria (calendario y Tickler de hoy, Waiting vencidos, repaso de Next)
;;   C-c g W   Revisión semanal oficial (Despejar · Al día · Crear)
;;   C-c g V   Revisión de horizontes (áreas, objetivos, visión, propósito)
;;   C-c g M   Volcado mental (la lista oficial de disparadores)
;;   C-c g N   Planificar un proyecto nuevo (Modelo de Planificación Natural)
;;   C-c g G   Replanificar el proyecto del punto
;;   C-c g S   Aclarar los proyectos atascados
;;   C-c g Q   Repaso de Waiting (por persona)
;;   C-c g U   Repaso de Someday/Maybe
;;   C-c g h   ¿Qué hago ahora?
;;
;; «Planificar el día» y «Cerrar el día» de la app no son de Allen y no están aquí.

(require 'org)
(require 'cl-lib)
(require 'seq)
(require 'subr-x)
(require 'organice-core)
(require 'organice-gtd)
(require 'organice-proc)
(require 'organice-tickler)
(require 'organice-horizons)
(require 'organice-allen-data)

(defcustom organice-allen-strict t
  "Como «Allen estricto» de la app: el Volcado mental sin el bloque «Extra» (no oficial)."
  :type 'boolean :group 'organice)

;;;; Ayudas -----------------------------------------------------------------------------------------

(defun organice--in-list-p (id) (eq (organice-list-of) id))
(defun organice-list-items (id) (organice-collect (lambda () (and (not (organice--project-p)) (organice--in-list-p id)))))

(defun organice--list-tags ()
  "Etiquetas que marcan una lista (las de Inbox) y la de la Papelera: no son personas ni lugares."
  (append (mapcar #'downcase (plist-get (organice--section 'inbox) :tags)) '("trash")))

(defun organice--drop-list-tags ()
  "Quita al encabezado del punto las etiquetas de Inbox (al sacarlo del Inbox)."
  (dolist (tg (org-get-tags nil t))
    (when (member (downcase tg) (mapcar #'downcase (plist-get (organice--section 'inbox) :tags)))
      (org-toggle-tag tg 'off))))

(defun organice--set-state (m state)
  "Pone STATE (o nil) a M sin preguntas ni traslados automáticos."
  (let ((organice-refile-from-inbox nil) (organice-no-subtask-question t))
    (organice-at m (org-todo (or state 'none)))))

(defun organice--out-of-inbox (m)
  "Si M es de primer nivel del fichero de entrada, lo pasa al final del fichero de tareas (como la
app al darle estado). Devuelve el marcador donde quede."
  (if (and (organice-at m (and (organice--inbox-file-p) (= (org-outline-level) 1)))
           (not (equal (file-truename (organice-inbox-path)) (file-truename (organice-tasks-path)))))
      (organice-refile-to m (organice-tasks-path) t)
    m))

(defun organice--effort-minutes (s)
  (and s (not (string-empty-p (string-trim s)))
       (ignore-errors (round (org-duration-to-minutes s)))))

(defun organice--person-of (m)
  "Persona de una espera: su primera etiqueta propia que no sea de lista."
  (seq-find (lambda (tg) (not (member (downcase tg) (organice--list-tags))))
            (organice-at m (org-get-tags nil t))))

(defun organice--choose (prompt choices)
  "CHOICES: ((TECLA ETIQUETA VALOR) …). Devuelve VALOR."
  (let* ((rmc (mapcar (lambda (c) (list (car c) (cadr c))) choices))
         (k (car (read-multiple-choice prompt rmc))))
    (nth 2 (assq k choices))))

;;;; Proyectos: ¿tienen siguiente acción? -------------------------------------------------------------

(defun organice--project-action-markers (p &optional pred)
  "Acciones abiertas de P (dentro de él o asignadas con :PROYECTO:) que cumplen PRED."
  (let ((id (organice-at p (org-entry-get (point) "ID"))) (out nil))
    (organice-at p
      (let ((end (save-excursion (org-end-of-subtree t t) (point))))
        (save-excursion
          (while (and (outline-next-heading) (< (point) end))
            (when (and (organice--kw) (not (organice--done-p)) (not (organice--trashed-p))
                       (or (null pred) (funcall pred)))
              (push (point-marker) out))))))
    (when id
      (setq out (append out (organice-collect
                             (lambda () (and (organice--kw) (not (organice--done-p))
                                             (equal (organice--project-link-id (org-entry-get (point) "PROYECTO")) id)
                                             (or (null pred) (funcall pred))))))))
    (nreverse out)))

(defun organice--next-like-p ()
  (or (organice--project-p) (equal (organice--kw) "NEXT")))

(defun organice-project-has-next-p (p)
  (and (organice--project-action-markers p #'organice--next-like-p) t))

(defun organice-active-projects ()
  (organice-sort-by-title (seq-filter #'organice--project-alive-p (organice-projects))))

(defun organice-sleeping-projects ()
  (organice-sort-by-title (seq-filter (lambda (p) (organice-at p (organice-sleeping-p t))) (organice-projects))))

(defun organice-add-next-to-project (p &optional title)
  "Añade una acción NEXT a P (si dormía, lo despierta)."
  (let ((title (or title (read-string (format "Siguiente acción de «%s»: " (organice-title p))))))
    (unless (string-empty-p (string-trim title))
      (organice-at p (org-entry-delete (point) "STATUS"))
      (organice-add-child p (string-trim title) "NEXT")
      "Acción añadida")))

(defun organice-act-sleep (p)
  (organice-at p (org-entry-put (point) "STATUS" "sleep")) (organice-save p) "Dormido")

(defun organice-act-wake (p)
  (organice-at p (org-entry-delete (point) "STATUS")) (organice-save p) "Despierto")

(defun organice-act-close-project (p)
  (when (y-or-n-p (format "¿Cerrar el proyecto «%s»? " (organice-title p)))
    (organice-at p (org-entry-delete (point) "STATUS") (org-todo "DONE"))
    (organice-save p) "Cerrado"))

;;;; Procesar Inbox (Allen estricto) ---------------------------------------------------------------------

(defun organice--ask-project ()
  "¿Forma parte de un proyecto? Devuelve nil, (new . NOMBRE) o (old . MARCADOR)."
  (pcase (organice--choose "¿Forma parte de un proyecto?"
                           '((?n "no" nil) (?u "uno nuevo" new) (?e "uno que ya existe" old)))
    ('new (let ((name (read-string "Nombre del proyecto nuevo: ")))
            (unless (string-empty-p (string-trim name)) (cons 'new (string-trim name)))))
    ('old (let* ((ps (mapcar (lambda (p) (cons (organice-title p) p)) (organice-projects)))
                 (c (and ps (completing-read "Proyecto: " ps nil t))))
            (and c (cons 'old (cdr (assoc c ps))))))))

(defun organice--put-in-project (m project)
  (when project
    (let ((target (if (eq (car project) 'old)
                      (cdr project)
                    (with-current-buffer (find-file-noselect (organice-tasks-path))
                      (org-with-wide-buffer
                       (goto-char (point-max))
                       (unless (bolp) (insert "\n"))
                       (insert "* PROJECT " (cdr project) "\n")
                       (forward-line -1)
                       (organice-set-created)
                       (save-buffer)
                       (point-marker))))))
      (organice-refile-to m target))))

(defun organice--process-one (m)
  "Las preguntas de Allen para M. Devuelve la etiqueta de lo hecho, 'skip o 'quit."
  (organice-visit m)
  (let ((title (organice-title m)))
    (pcase (organice--choose (format "«%s» — ¿Requiere acción?" title)
                             '((?s "sí" yes) (?n "no" no) (?e "editar" edit) (?k "saltar" skip) (?q "terminar" quit)))
      ('quit 'quit)
      ('skip 'skip)
      ('edit (recursive-edit) (organice--process-one m))
      ('no
       (pcase (organice--choose "¿Qué hago con ella?"
                                '((?p "papelera" trash) (?r "referencia" ref) (?s "someday / maybe" someday)
                                  (?t "tickler" tickler)))
         ('trash (organice-at m (org-toggle-tag "trash" 'on)) (organice-save m) "Papelera")
         ('ref (organice--set-state m nil)
               (organice-at m (organice--drop-list-tags))
               (organice-save m) (organice--out-of-inbox m) "Referencia")
         ('someday (organice--set-state m "MAYBE")
                   (organice-at m (organice--drop-list-tags))
                   (organice-save m) (organice--out-of-inbox m) "Someday")
         ('tickler (let ((d (org-read-date t nil nil "¿Cuándo quieres que te lo recuerde? ")))
                     (organice-at m (organice--drop-list-tags))
                     (organice--to-tickler m d)
                     (format "Tickler (%s)" d)))))
      ('yes
       (let ((next (read-string "¿Cuál es la siguiente acción? (física y visible) " title)))
         (unless (or (string-empty-p (string-trim next)) (equal next title))
           (organice-at m (org-edit-headline (string-trim next))))
         (let* ((how (organice--choose "¿Cómo?"
                                       '((?2 "menos de 2 minutos: hazla ya" done)
                                         (?d "delegar (Waiting)" waiting)
                                         (?a "aplazar" defer))))
                (label nil))
           (pcase how
             ('done (organice--set-state m "DONE") (setq label "Hecha"))
             ('waiting (let ((who (string-replace " " "_" (string-trim (read-string "¿Quién? ")))))
                         (organice--set-state m "WAITING")
                         (unless (string-empty-p who) (organice-at m (org-toggle-tag who 'on)))
                         (setq label "Waiting")))
             ('defer (organice--set-state m "NEXT")
                     (when (eq (organice--choose "¿Tiene día en el calendario?"
                                                 '((?n "no: a Next" no) (?s "sí: con fecha" yes)))
                               'yes)
                       (organice-at m (org-schedule nil (org-read-date t nil nil "¿Qué día? "))))
                     (setq label "Next")))
           (organice-at m (organice--drop-list-tags))
           (organice-save m)
           (let ((project (organice--ask-project)))
             (if project
                 (progn (organice--put-in-project m project) (setq label (concat label " · en el proyecto")))
               (organice--out-of-inbox m)))
           label))))))

(defun organice-process-inbox ()
  "Procesar Inbox (Allen estricto): una a una, las preguntas oficiales."
  (interactive)
  (let* ((items (organice-list-items 'inbox)) (n (length items)) (i 0) (done 0))
    (if (null items)
        (message "El Inbox está vacío ✓")
      (catch 'stop
        (dolist (m items)
          (setq i (1+ i))
          (when (organice-at m (organice--in-list-p 'inbox))
            (message "Procesar Inbox · %d de %d" i n)
            (let ((r (organice--process-one m)))
              (cond ((eq r 'quit) (throw 'stop nil))
                    ((stringp r) (setq done (1+ done)) (message "→ %s" r) (sit-for 0.6)))))))
      (org-save-all-org-buffers)
      (message "Procesadas: %d de %d" done n))))

;;;; Revisión diaria (4.16) --------------------------------------------------------------------------------

(defun organice--due-by-today-p ()
  (let ((today (org-today)) (s (organice--scheduled)) (d (organice--deadline)))
    (or (and s (<= s today)) (and d (<= d today)))))

(defun organice-calendar-today ()
  "Lo programado y lo que vence hoy (y lo atrasado): acciones abiertas, sin hábitos ni Waiting."
  (organice-sort-by-date
   (organice-collect (lambda () (and (organice-open-action-p) (not (organice--habit-p))
                                     (not (memq (organice-list-of) '(parked habit waiting)))
                                     (organice--due-by-today-p))))))

(defun organice-waiting-due ()
  (organice-sort-by-date
   (organice-collect (lambda () (and (organice-open-action-p) (organice--in-list-p 'waiting)
                                     (organice--due-by-today-p))))))

(defun organice-next-actions ()
  "Todas las acciones de Next (las de ★ primero)."
  (let ((all (organice-sort-by-title (organice-list-items 'next))))
    (append (seq-filter (lambda (m) (organice-at m (eq (organice--priority) ?A))) all)
            (seq-remove (lambda (m) (organice-at m (eq (organice--priority) ?A))) all))))

(defun organice-daily-review ()
  "Revisión diaria (la oficial de Allen): acaba en «¿Qué hago ahora?»."
  (interactive)
  (organice-proc-start
   "Revisión diaria"
   (mapcar
    (lambda (s)
      (pcase-let ((`(,id ,label ,hint) s))
        (append (list :id id :label label :hint hint)
                (pcase id
                  ('due (list :items #'organice-calendar-today
                              :actions (list (cons "✓ Hecha" #'organice-act-done)
                                             (cons "→ Mañana" #'organice-act-tomorrow)
                                             (cons "Fecha…" #'organice-act-date))))
                  ('tickler (list :items #'organice-tickler-today
                                  :actions (list (cons "Al Inbox" #'organice-act-inbox))))
                  ('waiting (list :items #'organice-waiting-due
                                  :actions (list (cons "✓ Recibida" #'organice-act-done)
                                                 (cons "→ Mañana" #'organice-act-tomorrow)
                                                 (cons "Reclamar" #'organice-act-chase))))
                  ('next (list :items #'organice-next-actions
                               :actions (list (cons "✓ Hecha" #'organice-act-done)
                                              (cons "★" #'organice-act-star))
                               :buttons (list (cons "¿Qué hago ahora?" #'organice-what-now))))))))
    organice-daily-review-steps)
   #'organice-what-now))

;;;; Revisión semanal oficial (4.15) -------------------------------------------------------------------

(defun organice--weekly-since ()
  "Día absoluto desde el que se mira (la última revisión semanal o hace 7 días)."
  (let ((d (organice-reviews-days-since 'weekly)))
    (- (org-today) (or d 7))))

(defun organice--open-dated-p ()
  (and (organice-open-action-p) (not (organice--habit-p)) (not (organice--parked-p))))

(defun organice-overdue ()
  (organice-sort-by-date
   (organice-collect (lambda () (and (organice--open-dated-p)
                                     (let ((s (organice--scheduled)) (d (organice--deadline)) (t0 (org-today)))
                                       (or (and s (< s t0)) (and d (< d t0)))))))))

(defun organice-past-calendar ()
  "Lo que tenía fecha desde la última revisión (también lo hecho), sin lo atrasado."
  (let ((since (organice--weekly-since)) (t0 (org-today)))
    (organice-sort-by-date
     (organice-collect
      (lambda ()
        (and (organice--kw) (not (organice--project-p)) (not (organice--habit-p))
             (not (and (organice-open-action-p)
                       (let ((s (organice--scheduled)) (d (organice--deadline)))
                         (or (and s (< s t0)) (and d (< d t0))))))
             (seq-some (lambda (x) (and x (< x t0) (>= x since)))
                       (list (organice--scheduled) (organice--deadline)))))))))

(defun organice-upcoming (&optional farther)
  "Próximos 7 días (o, con FARTHER, más adelante)."
  (let ((t0 (org-today)))
    (organice-sort-by-date
     (organice-collect
      (lambda ()
        (and (organice--open-dated-p)
             (let ((s (organice--scheduled)) (d (organice--deadline)))
               (if farther
                   (let ((f (seq-min (delq nil (list s d most-positive-fixnum))))) (and (< f most-positive-fixnum) (> f (+ t0 7))))
                 (and (not (or (and s (< s t0)) (and d (< d t0))))
                      (seq-some (lambda (x) (and x (>= x t0) (<= x (+ t0 7)))) (list s d)))))))))))

(defun organice--insert-group (title markers actions)
  (insert (propertize (format "%s  (%d)" title (length markers)) 'face 'organice-proc-step) "\n")
  (if markers
      (dolist (m markers) (organice-proc--item-line m actions))
    (insert (propertize "  Nada.\n" 'face 'shadow)))
  (insert "\n"))

(defun organice-act-chase (m)
  "Reclamar: una tarea en Next «Reclamar a Ana: …» con su etiqueta, en el fichero de tareas."
  (let* ((person (organice--person-of m))
         (name (and person (string-replace "_" " " (string-remove-prefix "@" person))))
         (title (if name (format "Reclamar a %s: %s" name (organice-title m))
                  (format "Reclamar: %s" (organice-title m)))))
    (with-current-buffer (find-file-noselect (organice-tasks-path))
      (org-with-wide-buffer
       (goto-char (point-max))
       (unless (bolp) (insert "\n"))
       (insert "* NEXT " title "\n")
       (forward-line -1)
       (when person (org-set-tags (list person)))
       (organice-set-created)
       (save-buffer)))
    "Reclamada (en Next)"))

(defun organice-act-copy-chase (m)
  (let* ((person (organice--person-of m))
         (name (and person (string-replace "_" " " (string-remove-prefix "@" person)))))
    (kill-new (format "Hola%s, ¿cómo va «%s»? Gracias." (if name (concat " " name) "") (organice-title m)))
    "Mensaje copiado"))

(defun organice--insert-project-cards ()
  (let ((ps (organice-active-projects)))
    (if (null ps)
        (insert (propertize "No hay proyectos activos.\n" 'face 'shadow))
      (dolist (p ps)
        (let ((nexts (organice--project-action-markers p (lambda () (equal (organice--kw) "NEXT"))))
              (area (organice-at p (org-entry-get (point) "AREA" t)))
              (obj (organice-at p (let ((v (org-entry-get (point) "OBJETIVO")))
                                    (and v (string-match "\\]\\[\\([^]]+\\)\\]\\]" v) (match-string 1 v))))))
          (insert (if nexts "✓ " "⚠ "))
          (insert-text-button (organice-title p) 'action (lambda (_) (organice-visit p)) 'follow-link t 'face 'bold)
          (insert (propertize (concat (if area (format "  · %s" area) "") (if obj (format "  · 🎯 %s" obj) ""))
                              'face 'shadow)
                  "\n")
          (if nexts
              (dolist (n nexts)
                (insert "    ▶ ")
                (insert-text-button (organice-title n) 'action (lambda (_) (organice-visit n)) 'follow-link t)
                (insert "\n"))
            (insert (propertize "    Sin siguiente acción\n" 'face 'warning)))
          (insert "    ")
          (organice-proc--button "＋ Acción" (lambda () (organice-add-next-to-project p) (organice-proc-refresh)))
          (organice-proc--button "Replanificar" (lambda () (organice-replan-project p)))
          (organice-proc--button "Dormir" (lambda () (organice-act-sleep p) (organice-proc-refresh)))
          (organice-proc--button "Cerrar" (lambda () (organice-act-close-project p) (organice-proc-refresh)))
          (insert "\n\n"))))))

(defun organice--insert-goals ()
  (if (not (file-exists-p (organice-horizons-path)))
      (insert (propertize (format "Sin %s: repasa de memoria tus objetivos (o créalo con C-c g H).\n"
                                  organice-horizons-file)
                          'face 'shadow))
    (organice-horizons--insert-objectives (organice-horizons-view-data))))

(defun organice-weekly-review ()
  "Revisión semanal oficial de Allen, en tres fases (Despejar · Al día · Crear)."
  (interactive)
  (organice-proc-start
   "Revisión semanal"
   (mapcar
    (lambda (s)
      (pcase-let ((`(,id ,phase ,label ,hint) s))
        (append
         (list :id id :phase phase :label label :hint hint)
         (pcase id
           ('loose (list :capture "Apuntar al Inbox"))
           ('inbox (list :items (lambda () (organice-list-items 'inbox))
                         :buttons (list (cons "Procesar Inbox" #'organice-process-inbox))
                         :empty "Inbox a cero ✓"))
           ('mind (list :capture "Apuntar al Inbox"
                        :buttons (list (cons "Volcado mental" #'organice-mind-sweep))))
           ('next (list :items #'organice-next-actions
                        :actions (list (cons "✓ Hecha" #'organice-act-done))
                        :capture "Apuntar un paso al Inbox"))
           ('past (list :capture "Apuntar al Inbox"
                        :insert (lambda ()
                                  (organice--insert-group "Atrasado" (organice-overdue)
                                                          (list (cons "✓ Hecha" #'organice-act-done)
                                                                (cons "Fecha…" #'organice-act-date)))
                                  (organice--insert-group "Desde la última revisión" (organice-past-calendar) nil))))
           ('upcoming (list :capture "Apuntar al Inbox"
                            :insert (lambda ()
                                      (organice--insert-group "Próximos 7 días" (organice-upcoming) nil)
                                      (organice--insert-group "Más adelante" (organice-upcoming t) nil))))
           ('waiting (list :items (lambda () (organice-list-items 'waiting))
                           :actions (list (cons "✓ Recibida" #'organice-act-done)
                                          (cons "Reclamar" #'organice-act-chase))))
           ('projects (list :insert #'organice--insert-project-cards))
           ('goals (list :capture "Apuntar al Inbox" :insert #'organice--insert-goals))
           ('checklists (list :capture "Apuntar al Inbox"))
           ('someday (list :items (lambda () (organice-list-items 'someday))
                           :actions (list (cons "Activar (→ Next)" #'organice-act-next)
                                          (cons "Borrar" #'organice-act-trash))))
           ('creative (list :capture "Apuntar una idea"))))))
    organice-weekly-review-steps)
   (lambda () (organice-reviews-mark 'weekly) (message "Revisión semanal hecha ✓"))))

;;;; Volcado mental --------------------------------------------------------------------------------------

(defun organice-mind-sweep ()
  "Volcado mental: la lista oficial de disparadores de Allen, uno a uno. Lo que apuntas va al Inbox.
Intro vacío = siguiente · «>» salta el bloque · «q» termina."
  (interactive)
  (let* ((steps (if organice-allen-strict
                    (seq-remove (lambda (s) (equal (car s) "Extra")) organice-mind-sweep)
                  organice-mind-sweep))
         (n (length steps)) (i 0) (count 0))
    (catch 'stop
      (while (< i n)
        (pcase-let ((`(,group ,label ,hint) (nth i steps)))
          (let ((txt (read-string (format "[%s %d/%d] %s — %s\nApunta (Intro vacío = siguiente · > saltar bloque · q terminar): "
                                          group (1+ i) n label hint))))
            (cond ((equal txt "q") (throw 'stop nil))
                  ((equal txt ">")
                   (let ((g group)) (while (and (< i n) (equal (car (nth i steps)) g)) (setq i (1+ i)))))
                  ((string-empty-p (string-trim txt)) (setq i (1+ i)))
                  (t (organice-capture-inbox txt) (setq count (1+ count))))))))
    (message "Volcado mental: %d apuntada(s) al Inbox" count)))

;;;; Planificar un proyecto (Modelo de Planificación Natural, 4.14) ----------------------------------

(defconst organice--plan-fields '((purpose . "Propósito") (principles . "Principios")
                                  (outcome . "Resultado") (stakeholders . "Partes interesadas")))

(defun organice--parse-plan-notes (notes)
  "((purpose . …) … (rest . RESTO)) de las notas de un proyecto."
  (let (out rest)
    (dolist (line (split-string (or notes "") "\n"))
      (let ((f (seq-find (lambda (f) (string-prefix-p (concat (cdr f) ":") line)) organice--plan-fields)))
        (if (and f (not (alist-get (car f) out)))
            (push (cons (car f) (string-trim (substring line (1+ (length (cdr f)))))) out)
          (push line rest))))
    (cons (cons 'rest (string-trim (string-join (nreverse rest) "\n"))) out)))

(defun organice--plan-notes (plan)
  (string-join (delq nil (mapcar (lambda (f) (let ((v (string-trim (or (alist-get (car f) plan) ""))))
                                               (unless (string-empty-p v) (format "%s: %s" (cdr f) v))))
                                 organice--plan-fields))
               "\n"))

(defun organice--show-triggers ()
  (with-current-buffer (get-buffer-create "*ORGanice · Disparadores del proyecto*")
    (let ((inhibit-read-only t))
      (erase-buffer)
      (insert (propertize "Lista de disparadores del proyecto (Allen)\n\n" 'face 'bold))
      (dolist (tr organice-brainstorm-triggers)
        (insert (propertize (car tr) 'face 'bold) "\n  " (cadr tr) "\n")))
    (special-mode)
    (goto-char (point-min))
    (display-buffer (current-buffer))))

(defun organice--read-list (prompt &optional initial)
  "Lee elementos uno a uno hasta Intro vacío."
  (let ((out (copy-sequence initial)) txt)
    (while (not (string-empty-p (setq txt (string-trim (read-string (format "%s (%d; Intro vacío = fin): " prompt (length out)))))))
      (setq out (append out (list txt))))
    out))

(defun organice--read-next (unit choices)
  "Siguiente acción de UNIT: (ACCIÓN QUIÉN MÁS) o nil."
  (let* ((more "(hace falta planificar más)") (none "(ninguna todavía)")
         (c (completing-read (format "Siguiente acción de «%s» (elige o escribe): " unit)
                             (append choices (list more none)) nil nil)))
    (cond ((or (string-empty-p c) (equal c none)) nil)
          ((equal c more) (list nil nil t))
          (t (let ((who (string-trim (read-string "¿Quién? (etiqueta; vacío = tú) "))))
               (list c (unless (string-empty-p who) (string-replace " " "_" (string-remove-prefix "@" who))) nil))))))

(defun organice--unit-tasks (titles next name)
  "Tareas de una unidad: (TÍTULO ESTADO ETIQUETAS) en orden."
  (let* ((action (car next)) (who (cadr next)) (more (nth 2 next)) head)
    (when more (push (list (format "Planificar: %s" name) "NEXT" nil) head))
    (when action (push (list action (if more "TODO" "NEXT") (and who (list who))) head))
    (append (nreverse head)
            (mapcar (lambda (x) (list x "TODO" nil)) (seq-remove (lambda (x) (equal x action)) titles)))))

(defun organice--plan-wizard (plan)
  "Los 6 pasos sobre PLAN (alist); devuelve el plan con :ideas :components :nexts."
  (dolist (f '((purpose . "1) Propósito: ¿por qué lo haces? ")
               (principles . "1) Principios: normas con que decidirás ")
               (outcome . "2) Resultado deseado: ¿cómo sabrás que está terminado? ")
               (stakeholders . "2) Partes interesadas (opcional): ")))
    (setf (alist-get (car f) plan) (read-string (cdr f) (alist-get (car f) plan))))
  (let ((again t))
    (while again
      (organice--show-triggers)
      (setf (alist-get 'ideas plan) (organice--read-list "3) Lluvia de ideas" (alist-get 'ideas plan)))
      ;; 4) organizar: componentes (partes con varias acciones)
      (let* ((ideas (alist-get 'ideas plan))
             (comps (completing-read-multiple "4) Componentes (partes con varias acciones; vacío = ninguno): "
                                              ideas nil t (string-join (mapcar #'car (alist-get 'components plan)) ","))))
        (setf (alist-get 'components plan)
              (mapcar (lambda (c) (cons c (organice--read-list (format "   Acciones de «%s»" c)
                                                               (cdr (assoc c (alist-get 'components plan))))))
                      comps)))
      ;; 5) siguientes acciones
      (let* ((comps (alist-get 'components plan))
             (loose (seq-remove (lambda (i) (assoc i comps)) (alist-get 'ideas plan)))
             nexts)
        (when (or loose (null comps))
          (push (cons "" (organice--read-next (alist-get 'name plan) loose)) nexts))
        (dolist (c comps) (push (cons (car c) (organice--read-next (car c) (cdr c))) nexts))
        (setf (alist-get 'nexts plan) (nreverse nexts)))
      ;; 6) ¿sigue en tu mente?
      (setq again (and (not (seq-some #'cdr (alist-get 'nexts plan)))
                       (progn (message "Hace falta al menos una siguiente acción (o «planificar más»)") (sit-for 1) t)))
      (unless again
        (setq again (y-or-n-p "6) ¿Sigue el proyecto en tu mente? (sí = volver a las ideas) ")))))
  (when-let ((w (get-buffer-window "*ORGanice · Disparadores del proyecto*"))) (delete-window w))
  plan)

(defun organice--plan-tasks (plan)
  "Tareas del plan: (TÍTULO ESTADO ETIQUETAS [HIJAS]); componente con ≥2 = subproyecto."
  (let* ((comps (alist-get 'components plan))
         (loose (seq-remove (lambda (i) (assoc i comps)) (alist-get 'ideas plan)))
         (general (cdr (assoc "" (alist-get 'nexts plan))))
         out)
    (when (or general loose)
      (setq out (organice--unit-tasks loose general (alist-get 'name plan))))
    (dolist (c comps)
      (let ((kids (organice--unit-tasks (cdr c) (cdr (assoc (car c) (alist-get 'nexts plan))) (car c))))
        (setq out (append out (list (cond ((>= (length kids) 2) (list (car c) "PROJECT" nil kids))
                                          (kids (car kids))
                                          (t (list (car c) "TODO" nil))))))))
    out))

(defun organice--write-plan-tasks (parent tasks existing)
  "Escribe TASKS bajo PARENT, solo las que no están en EXISTING (títulos, sin mayúsculas).
Si una que ya existía es la siguiente acción, pasa a NEXT."
  (dolist (tk tasks)
    (pcase-let ((`(,title ,state ,tags ,kids) tk))
      (let ((old (cdr (assoc (downcase title) existing))))
        (cond (old
               (when (equal state "NEXT") (organice--set-state old "NEXT") (organice-save old))
               (when kids (organice--write-plan-tasks old kids existing)))
              (t (let ((m (organice-add-child parent title state tags)))
                   (when kids (organice--write-plan-tasks m kids existing)))))))))

(defun organice--set-notes (m notes)
  "Cambia las líneas del plan de las notas de M (el resto se respeta)."
  (organice-at m
    (let* ((b (save-excursion (org-end-of-meta-data t) (point)))
           (e (save-excursion (if (outline-next-heading) (point) (point-max))))
           (old (buffer-substring-no-properties b e))
           (rest (alist-get 'rest (organice--parse-plan-notes old)))
           (new (string-join (seq-remove #'string-empty-p (list notes rest)) "\n")))
      (delete-region b e)
      (goto-char b)
      (unless (string-empty-p new) (insert new "\n"))
      (save-buffer))))

(defun organice-plan-project (&optional objective)
  "Planificar un proyecto nuevo (Modelo de Planificación Natural de Allen). OBJECTIVE: marcador del
objetivo de horizons.org al que apuntará."
  (interactive)
  (let* ((name (string-trim (read-string "Nombre del proyecto: ")))
         (plan (organice--plan-wizard (list (cons 'name name)))))
    (when (string-empty-p name) (user-error "Sin nombre"))
    (let ((p (with-current-buffer (find-file-noselect (organice-tasks-path))
               (org-with-wide-buffer
                (goto-char (point-max))
                (unless (bolp) (insert "\n"))
                (insert "* PROJECT " name "\n")
                (forward-line -1)
                (organice-set-created)
                (save-buffer)
                (point-marker)))))
      (when objective
        (let ((id (organice-at objective (prog1 (org-id-get-create) (save-buffer))))
              (area (organice-at objective (org-entry-get (point) "AREA"))))
          (organice-at p
            (org-entry-put (point) "OBJETIVO" (format "[[id:%s][%s]]" id (replace-regexp-in-string "[][]" "" (organice-title objective))))
            (when area (org-entry-put (point) "AREA" area))
            (save-buffer))))
      (organice--set-notes p (organice--plan-notes plan))
      (organice--write-plan-tasks p (organice--plan-tasks plan) nil)
      (org-save-all-org-buffers)
      (message "Proyecto creado: %s" name)
      (organice-visit p))))

(defun organice-replan-project (&optional p)
  "Replanificar un proyecto: el mismo proceso con lo que ya tiene; solo AÑADE lo nuevo."
  (interactive)
  (let* ((p (or p (organice--entry-marker)))
         (p (if (organice-at p (organice--project-p)) p
              (or (organice-at p (let (r) (while (and (not r) (org-up-heading-safe))
                                            (when (organice--project-p) (setq r (point-marker))))
                                   r))
                  (user-error "No estás en un PROJECT"))))
         (notes (organice-at p (let ((b (save-excursion (org-end-of-meta-data t) (point)))
                                     (e (save-excursion (if (outline-next-heading) (point) (point-max)))))
                                 (buffer-substring-no-properties b e))))
         (parsed (organice--parse-plan-notes notes))
         (open (organice--project-action-markers p))
         (existing (mapcar (lambda (m) (cons (downcase (organice-title m)) m)) open))
         (plan (append (list (cons 'name (organice-title p)))
                       (seq-remove (lambda (x) (eq (car x) 'rest)) parsed)
                       (list (cons 'ideas (mapcar #'organice-title
                                                  (seq-remove (lambda (m) (organice-at m (organice--project-p))) open)))
                             (cons 'components
                                   (mapcar (lambda (sp) (cons (organice-title sp)
                                                              (mapcar #'organice-title (organice--project-action-markers sp))))
                                           (seq-filter (lambda (m) (organice-at m (organice--project-p))) open))))))
         (plan (progn
                 ;; los componentes existentes también son ideas (para poder elegirlos)
                 (setf (alist-get 'ideas plan) (append (alist-get 'ideas plan) (mapcar #'car (alist-get 'components plan))))
                 (organice--plan-wizard plan))))
    (organice--set-notes p (organice--plan-notes plan))
    (organice--write-plan-tasks p (organice--plan-tasks plan) existing)
    (org-save-all-org-buffers)
    (message "Proyecto replanificado: %s" (organice-title p))))

;;;; Proyectos atascados, Waiting y Someday (4.06) -----------------------------------------------------

(defun organice-stuck-projects ()
  "Aclarar los proyectos atascados: activos sin acción en Next, y los dormidos."
  (interactive)
  (organice-proc-start
   "Aclarar proyectos atascados"
   (list (list :label "Proyectos sin acción siguiente y dormidos"
               :hint "¿Sigue vivo? Sí: añade el siguiente paso (si dormía, despierta). Si no, a Someday (dormir) o ciérralo."
               :items (lambda () (append (seq-remove #'organice-project-has-next-p (organice-active-projects))
                                         (organice-sleeping-projects)))
               :actions (list (cons "Sí: siguiente paso" #'organice-add-next-to-project)
                              (cons "Someday (dormir)" #'organice-act-sleep)
                              (cons "Cerrar" #'organice-act-close-project))
               :empty "Ningún proyecto atascado ✓"))))

(defun organice-waiting-review ()
  "Repaso de Waiting: las esperas por persona (su etiqueta)."
  (interactive)
  (organice-proc-start
   "Repaso de Waiting"
   (list (list :label "Esperas por persona"
               :hint "✓ si ya ha llegado; si se retrasa, «Reclamar» (una tarea en Next) o copia un mensaje."
               :insert (lambda ()
                         (let ((groups nil))
                           (dolist (m (organice-sort-by-title (organice-list-items 'waiting)))
                             (let* ((p (or (organice--person-of m) "")) (cell (assoc p groups)))
                               (if cell (setcdr cell (append (cdr cell) (list m))) (push (list p m) groups))))
                           (setq groups (sort groups (lambda (a b) (cond ((equal (car a) "") nil) ((equal (car b) "") t)
                                                                         (t (string-collate-lessp (car a) (car b)))))))
                           (if (null groups) (insert (propertize "No hay nada en Waiting ✓\n" 'face 'shadow))
                             (dolist (g groups)
                               (organice--insert-group (if (equal (car g) "") "Sin persona"
                                                         (string-replace "_" " " (string-remove-prefix "@" (car g))))
                                                       (cdr g)
                                                       (list (cons "✓ Recibida" #'organice-act-done)
                                                             (cons "Reclamar" #'organice-act-chase)
                                                             (cons "Copiar mensaje" #'organice-act-copy-chase)))))))))))

(defun organice-someday-review ()
  "Repaso de Someday/Maybe: las ideas y los proyectos dormidos."
  (interactive)
  (organice-proc-start
   "Repaso de Someday/Maybe"
   (list (list :label "Someday / Maybe y proyectos dormidos"
               :hint "Activa lo que ya toque; lo demás se queda (o a la Papelera)."
               :insert (lambda ()
                         (organice--insert-group "Someday" (organice-sort-by-title (organice-list-items 'someday))
                                                 (list (cons "Activar (→ Next)" #'organice-act-next)
                                                       (cons "Papelera" #'organice-act-trash)))
                         (organice--insert-group "Proyectos dormidos" (organice-sleeping-projects)
                                                 (list (cons "Activar (despertar)" #'organice-act-wake))))))))

;;;; ¿Qué hago ahora? (4.05) ---------------------------------------------------------------------------

(defun organice--place-tags ()
  "Etiquetas «de lugar» (las que empiezan por @, sin las de Inbox) de las acciones de Next."
  (let (all)
    (dolist (m (organice-list-items 'next))
      (dolist (tg (organice-at m (org-get-tags)))
        (unless (or (member (downcase tg) (organice--list-tags)) (member tg all)) (push tg all))))
    (setq all (sort all #'string-collate-lessp))
    (or (seq-filter (lambda (tg) (string-prefix-p "@" tg)) all) all)))

(defun organice-what-now-items (tag time energy quick)
  (let* ((max-e (and energy (pcase (downcase energy) ("low" 1) ("medium" 2) (_ 3))))
         (rank (lambda (e) (pcase (downcase (or e "")) ((or "quickwin" "low") 1) ("medium" 2) ("high" 3))))
         (items (organice-collect
                 (lambda ()
                   (and (organice-open-action-p)
                        (let ((l (organice-list-of)))
                          (and (or (eq l 'next) (organice-focus-p))
                               (not (memq l '(waiting someday parked habit)))))
                        (or (null tag) (member tag (org-get-tags)))
                        (let ((mins (organice--effort-minutes (org-entry-get (point) "Effort")))
                              (en (org-entry-get (point) "Energy")))
                          (and (or (not quick) (equal (downcase (or en "")) "quickwin") (and mins (<= mins 10)))
                               (or (null time) (null mins) (<= mins time))
                               (or (null max-e) (null en) (null (funcall rank en)) (<= (funcall rank en) max-e))))))))
         (score (lambda (m) (organice-at m (+ (if (eq (organice--priority) ?A) 0 2)
                                              (if (organice--due-by-today-p) 0 1)))))
         (mins (lambda (m) (or (organice-at m (organice--effort-minutes (org-entry-get (point) "Effort"))) 9999))))
    (sort items (lambda (a b)
                  (let ((sa (funcall score a)) (sb (funcall score b)))
                    (if (/= sa sb) (< sa sb)
                      (let ((ma (funcall mins a)) (mb (funcall mins b)))
                        (if (/= ma mb) (< ma mb)
                          (string-collate-lessp (organice-title a) (organice-title b) nil t)))))))))

(defun organice-what-now ()
  "¿Qué hago ahora?: dónde estás, el tiempo y la energía (o «rápido») → hasta 3 acciones de Next."
  (interactive)
  (let* ((quick (eq (organice--choose "¿Qué hago ahora?" '((?f "elegir dónde, tiempo y energía" filter)
                                                           (?r "rápido (QuickWin o 10 min)" quick)))
                    'quick))
         (any "(cualquiera)")
         (tag (unless quick (let ((c (completing-read "¿Dónde estás? " (cons any (organice--place-tags)) nil t)))
                              (unless (equal c any) c))))
         (time (unless quick (let ((c (completing-read "¿Cuánto tiempo tienes? " '("10 min" "30 min" "1 h" "2 h" "(sin límite)") nil t)))
                               (cdr (assoc c '(("10 min" . 10) ("30 min" . 30) ("1 h" . 60) ("2 h" . 120)))))))
         (energy (unless quick (let ((c (completing-read "¿Tu energía? " (list any "Low" "Medium" "High") nil t)))
                                 (unless (equal c any) c))))
         (shown 3))
    (organice-proc-start
     "¿Qué hago ahora?"
     (list (list :label (string-join (delq nil (list (if quick "Rápido" nil) tag
                                                     (and time (format "≤ %d min" time)) energy))
                                     " · ")
                 :hint "★ y lo que vence primero; luego lo más corto."
                 :buttons (list (cons "Otras" (lambda () (setq shown (+ shown 3)))))
                 :items (lambda () (seq-take (organice-what-now-items tag time energy quick) shown))
                 :actions (list (cons "✓ Hecha" #'organice-act-done) (cons "★" #'organice-act-star))
                 :empty "Nada encaja. Prueba con menos filtros.")))))

;;;; Procesos (como Menú ☰ › Procesos) -------------------------------------------------------------------

(defconst organice-processes
  '(("Diarios › Procesar Inbox" . organice-process-inbox)
    ("Diarios › Revisión diaria" . organice-daily-review)
    ("Diarios › ¿Qué hago ahora?" . organice-what-now)
    ("Puntuales › Volcado mental" . organice-mind-sweep)
    ("Puntuales › Planificar un proyecto nuevo" . organice-plan-project)
    ("Puntuales › Replanificar el proyecto del punto" . organice-replan-project)
    ("Puntuales › Aclarar un proyecto atascado" . organice-stuck-projects)
    ("Periódicos › Revisión semanal" . organice-weekly-review)
    ("Periódicos › Repaso de Waiting" . organice-waiting-review)
    ("Periódicos › Repaso de Someday/Maybe" . organice-someday-review)
    ("Periódicos › Revisión de horizontes" . organice-horizons-review)))

(defun organice-processes ()
  "Elige un proceso de GTD (como Menú ☰ › Procesos de la app)."
  (interactive)
  (let ((c (completing-read "Proceso: " (mapcar #'car organice-processes) nil t)))
    (call-interactively (cdr (assoc c organice-processes)))))

(provide 'organice-allen)
;;; organice-allen.el ends here
