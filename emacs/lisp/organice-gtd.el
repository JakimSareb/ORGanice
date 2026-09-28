;;; organice-gtd.el --- ORGanice: la vista GTD (estilo Nirvana) en la agenda de Org  -*- lexical-binding: t; -*-

;; Las mismas listas que la vista GTD de la app, con las mismas reglas por defecto
;; (Ajustes → Vista GTD y gestos → «Restablecer»):
;;
;;   Focus      ★ [#A] o fecha (programada o límite) de hoy o pasada; sin hábitos
;;   Inbox      etiqueta @inbox, o encabezados sin estado de inbox.org
;;   Next       NEXT          Todo  TODO          Waiting  WAITING        Someday  MAYBE
;;   Scheduled  programadas para más adelante + todos los hábitos
;;              (secciones: normales / «Se repiten» / «Hábitos»)
;;   Deadline   con fecha límite (ya empezadas)
;;   Proyectos  PROJECT: activos / programados (SCHEDULED futuro) / dormidos (:sleep:)
;;   Reference  encabezados sin estado ni tareas debajo
;;   Logbook    terminadas: esta semana / la pasada / el mes pasado / este año / anteriores
;;
;; Reglas comunes: una tarea va a UNA sola lista, la primera que encaja en el orden de
;; `organice-list-order'; las programadas para más adelante solo salen en Scheduled salvo que
;; tengan prioridad; los hábitos solo en Scheduled; las tareas de proyectos dormidos o que aún no
;; empiezan no salen (salvo en su proyecto).
;;
;; Todas las vistas: C-c g (o F12 para cambiar entre Documentos y GTD).

(require 'org)
(require 'org-agenda)
(require 'org-habit)
(require 'seq)
(require 'cl-lib)
(require 'subr-x)
(require 'organice-core)

;;;; Configuración de las secciones (equivale a Ajustes → Vista GTD: secciones) ---------------

(defcustom organice-list-order '(inbox next later waiting someday reference)
  "Orden de las listas exclusivas: si una tarea cumple varias, va a la primera."
  :type '(repeat symbol) :group 'organice)

(defcustom organice-sections
  '((inbox     :tags ("@inbox") :inbox-file t)
    (next      :states ("NEXT"))
    (later     :states ("TODO"))
    (waiting   :states ("WAITING"))
    (someday   :states ("MAYBE"))
    (reference :no-state-leaf t)
    ;; Vistas que cruzan listas: reglas extra (vacías por defecto) y casillas
    (focus     :star t :due t :auto-star t)
    (scheduled :habits t :future t :future-priority t)
    (deadline)
    (projects  :parked t)
    (logbook   :habits t :future t :future-priority t :parked t))
  "Reglas de cada sección. Claves:
:states (estados), :tags (etiquetas propias), :props (\"NOMBRE\" o \"NOMBRE=valor\"),
:inbox-file (Inbox: sin estado en inbox.org), :no-state-leaf (Reference),
:star / :due / :auto-star (Focus),
casillas :habits :future :future-priority :parked (por defecto: no, no, sí, no)."
  :type '(alist :key-type symbol :value-type plist) :group 'organice)

(defcustom organice-auto-star t
  "Poner ★ [#A] a las tareas cuando llega su fecha (una sola vez), como la app."
  :type 'boolean :group 'organice)

(defcustom organice-group-by-project nil
  "Agrupar las listas (Focus, Inbox, Next, Todo, Waiting, Someday, Reference) por proyecto,
como el botón «Agrupar por proyecto» de la app: primero las tareas sin proyecto y después un
grupo por proyecto (necesita org-super-agenda)."
  :type 'boolean :group 'organice)

(defun organice--section (id) (cdr (assq id organice-sections)))
(defun organice--opt (id key &optional default)
  (let ((plist (organice--section id)))
    (if (plist-member plist key) (plist-get plist key) default)))

;;;; Datos de un encabezado (en el punto) -----------------------------------------------------

(defun organice--kw () (org-get-todo-state))
(defun organice--done-p () (member (org-get-todo-state) org-done-keywords))
(defun organice--project-p () (equal (org-get-todo-state) "PROJECT"))
(defun organice--habit-p () (org-is-habit-p))
(defun organice--own-tags () (mapcar #'downcase (org-get-tags nil t)))

(defun organice--priority ()
  "Letra de la prioridad del encabezado, o nil si no tiene."
  (save-excursion
    (org-back-to-heading t)
    (let ((case-fold-search nil))
      (when (looking-at org-complex-heading-regexp)
        (when-let ((cookie (match-string-no-properties 3)))
          (string-to-char (substring cookie 2 3)))))))

(defun organice--days (time) (and time (time-to-days time)))
(defun organice--scheduled () (organice--days (org-get-scheduled-time (point))))
(defun organice--deadline () (organice--days (org-get-deadline-time (point))))
(defun organice--today () (org-today))
(defun organice--future-scheduled-p ()
  (let ((s (organice--scheduled))) (and s (> s (organice--today)))))

(defun organice--inbox-file-p ()
  (let ((f (buffer-file-name (buffer-base-buffer))))
    (and f (string= (file-name-nondirectory f) organice-inbox-file))))

(defun organice--inbox-tagged-p ()
  (let ((tags (mapcar #'downcase (plist-get (organice--section 'inbox) :tags))))
    (and tags (seq-some (lambda (tg) (member tg tags)) (organice--own-tags)))))

(defun organice--task-like-p () (or (organice--kw) (organice--inbox-tagged-p)))

(defun organice--ancestors (fn)
  "Llama a FN en cada antepasado (del más cercano al más lejano); para si devuelve no nil."
  (save-excursion
    (org-back-to-heading t)
    (let (res)
      (while (and (not res) (org-up-heading-safe))
        (setq res (funcall fn)))
      res)))

(defun organice--parent-has-keyword-p () (organice--ancestors (lambda () (organice--kw))))

(defun organice--has-task-children-p ()
  (save-excursion
    (org-back-to-heading t)
    (let ((end (save-excursion (org-end-of-subtree t t))) found)
      (while (and (not found) (outline-next-heading) (< (point) end))
        (when (organice--kw) (setq found t)))
      found)))

(defun organice--parked-p ()
  "Tarea de un proyecto dormido (:sleep:) o que aún no empieza (SCHEDULED futuro)."
  (and (not (organice--project-p))
       (not (organice--done-p))
       (or (member "sleep" (mapcar #'downcase (org-get-tags)))
           (organice--ancestors
            (lambda ()
              (or (member "sleep" (organice--own-tags))
                  (and (organice--project-p) (organice--future-scheduled-p))))))))

(defun organice--property (name) (org-entry-get (point) name))

(defun organice--matches-rules-p (plist)
  "¿Cumple el encabezado alguna regla (estados, etiquetas, propiedades) de PLIST?"
  (let ((kw (organice--kw)))
    (or (and kw (member kw (plist-get plist :states)))
        (let ((tags (mapcar #'downcase (plist-get plist :tags))))
          (and tags (seq-some (lambda (tg) (member tg tags)) (organice--own-tags))))
        (seq-some (lambda (rule)
                    (let* ((parts (split-string rule "="))
                           (value (organice--property (string-trim (car parts)))))
                      (and value (not (string-empty-p value))
                           (or (null (cdr parts))
                               (string= (downcase value)
                                        (downcase (string-trim (string-join (cdr parts) "="))))))))
                  (plist-get plist :props)))))

(defun organice--hidden-by (id)
  "Motivo por el que las casillas de la sección ID ocultan la tarea, o nil."
  (cond ((and (organice--parked-p) (not (organice--opt id :parked nil))) 'parked)
        ((and (organice--habit-p) (organice--task-like-p) (not (organice--opt id :habits nil))) 'habit)
        ((and (organice--task-like-p) (organice--future-scheduled-p)
              (not (if (organice--priority)
                       (organice--opt id :future-priority t)
                     (organice--opt id :future nil))))
         'scheduled)))

(defun organice--matches-list-p (id)
  (let ((plist (organice--section id)))
    (or (organice--matches-rules-p plist)
        (and (plist-get plist :inbox-file) (not (organice--kw))
             (organice--inbox-file-p) (not (organice--parent-has-keyword-p)))
        (and (plist-get plist :no-state-leaf) (not (organice--kw))
             (not (organice--has-task-children-p)) (not (organice--parent-has-keyword-p))))))

(defun organice-list-of ()
  "Lista a la que pertenece el encabezado del punto (como la app)."
  (cond ((organice--done-p) 'logbook)
        ((organice--project-p) 'project)
        (t (catch 'found
             (dolist (id organice-list-order)
               (when (organice--matches-list-p id)
                 (throw 'found (or (organice--hidden-by id) id))))
             (when (organice--parked-p) 'parked)))))

(defun organice-focus-p ()
  (and (not (organice--done-p)) (not (organice--project-p))
       (let* ((today (organice--today))
              (s (organice--scheduled)) (d (organice--deadline))
              (base (and (organice--kw)
                         (or (and (organice--opt 'focus :star t) (eq (organice--priority) ?A))
                             (and (organice--opt 'focus :due t)
                                  (or (and s (<= s today)) (and d (<= d today))))))))
         (and (or base (organice--matches-rules-p (organice--section 'focus)))
              (not (organice--hidden-by 'focus))))))

(defun organice-scheduled-view-p ()
  (and (not (organice--done-p)) (not (organice--project-p))
       (or (and (organice--task-like-p)
                (or (organice--future-scheduled-p)
                    (and (organice--habit-p) (organice--opt 'scheduled :habits t))))
           (organice--matches-rules-p (organice--section 'scheduled)))
       (not (organice--hidden-by 'scheduled))))

(defun organice-deadline-view-p ()
  (and (not (organice--done-p)) (not (organice--project-p))
       (or (and (organice--deadline) (organice--kw))
           (organice--matches-rules-p (organice--section 'deadline)))
       (not (organice--hidden-by 'deadline))))

(defun organice-project-state ()
  "Estado de un PROJECT: active, scheduled o sleep."
  (cond ((member "sleep" (organice--own-tags)) 'sleep)
        ((organice--future-scheduled-p) 'scheduled)
        (t 'active)))

;;;; Funciones para saltar encabezados en la agenda --------------------------------------------

(defun organice--skip-unless (pred)
  "Para `org-agenda-skip-function': salta el encabezado si PRED no se cumple."
  (let ((next (save-excursion (or (outline-next-heading) (point-max)))))
    (if (save-excursion (org-back-to-heading t) (funcall pred)) nil next)))

(defun organice-skip-unless-list (id)
  (organice--skip-unless (lambda () (eq (organice-list-of) id))))

;;;; Presentación de las filas (fechas como en la app) -----------------------------------------

(defun organice-agenda-dates ()
  "Texto corto con la fecha programada futura y la límite, para las filas de la agenda."
  (let* ((today (org-today))
         (s (org-get-scheduled-time (point)))
         (d (org-get-deadline-time (point)))
         (fmt (lambda (time) (format-time-string "%e %b" time))))
    (string-trim
     (concat (when (and s (> (time-to-days s) today)) (concat "📅" (funcall fmt s) " "))
             (when d (concat "⚑" (funcall fmt d)))))))

(defvar organice-agenda-prefix
  '((agenda . " %i %-12:c%?-12t% s")
    (todo . " %i %-12:c ")
    (tags . " %i %-12:c %-14(organice-agenda-dates) ")
    (search . " %i %-12:c ")))

;;;; Grupos (org-super-agenda, si está instalado) ----------------------------------------------

(defun organice--super-agenda-p () (require 'org-super-agenda nil t))

(defun organice--item-marker (item) (get-text-property 0 'org-marker item))
(defmacro organice--at-item (item &rest body)
  `(let ((m (organice--item-marker ,item)))
     (when (markerp m)
       (with-current-buffer (marker-buffer m)
         (org-with-wide-buffer (goto-char m) ,@body)))))

(defun organice-item-repeats-p (item)
  (organice--at-item
   item
   (let ((s (org-entry-get (point) "SCHEDULED")) (d (org-entry-get (point) "DEADLINE")))
     (and (not (organice--habit-p))
          (or (and s (string-match-p "[.+]?\\+[0-9]+[hdwmy]" s))
              (and d (string-match-p "[.+]?\\+[0-9]+[hdwmy]" d)))))))

(defun organice-item-habit-p (item) (organice--at-item item (organice--habit-p)))

(defun organice--closed-days (item)
  (organice--at-item item
                     (let ((c (org-entry-get (point) "CLOSED")))
                       (and c (time-to-days (org-time-string-to-time c))))))

(defun organice--logbook-group (days)
  "Grupo del Logbook (como la app): week, lastweek, lastmonth, year u older."
  (let* ((today (org-today))
         (dow (1- (string-to-number (format-time-string "%u")))) ; lunes = 0
         (week-start (- today dow))
         (date (calendar-gregorian-from-absolute today)) ; (mes día año)
         (month (car date)) (year (nth 2 date))
         (last-month-start (calendar-absolute-from-gregorian
                            (if (= month 1) (list 12 1 (1- year)) (list (1- month) 1 year))))
         (year-start (calendar-absolute-from-gregorian (list 1 1 year))))
    (cond ((null days) 'older)
          ((>= days week-start) 'week)
          ((>= days (- week-start 7)) 'lastweek)
          ((>= days last-month-start) 'lastmonth)
          ((>= days year-start) 'year)
          (t 'older))))


;;;; Vistas (C-c g …) -----------------------------------------------------------------------

;; Un bloque de la agenda: TYPE (tags, tags-todo, todo), MATCH, título, función que decide qué
;; encabezados entran y ajustes extra.
(defun organice--block (type match header pred &rest settings)
  `(,type ,match
          ((org-agenda-overriding-header ,header)
           ,@(when pred `((org-agenda-skip-function '(organice--skip-unless #',pred))))
           (org-agenda-prefix-format organice-agenda-prefix)
           ,@settings)))

(defun organice--groups (groups)
  "Ajuste de grupos para org-super-agenda (si está instalado)."
  (when (organice--super-agenda-p)
    `((org-super-agenda-groups ',groups))))

(defun organice--list-pred (id)
  "Función (sin argumentos) que dice si el encabezado va en la lista ID."
  (lambda () (eq (organice-list-of) id)))

(defun organice--project-title-here ()
  "Título del PROJECT que contiene el punto (o nil si la tarea está suelta)."
  (save-excursion
    (let (title)
      (while (and (not title) (org-up-heading-safe))
        (when (organice--project-p) (setq title (org-get-heading t t t t))))
      title)))
(defun organice--item-project-title (item)
  (organice--at-item item (organice--project-title-here)))
(defun organice--item-loose-p (item) (not (organice--item-project-title item)))

(defun organice--list-block (title id)
  (let ((fn (intern (format "organice--in-%s-p" id))))
    (defalias fn (organice--list-pred id))
    (if organice-group-by-project
        ;; Agrupadas: dentro de cada proyecto, el orden del fichero (las que ya han llegado a
        ;; su fecha, primero), como en la app
        (apply #'organice--block 'tags "LEVEL>0" title fn
               '(org-agenda-sorting-strategy '(user-defined-up))
               '(org-agenda-cmp-user-defined #'organice--cmp-due-first)
               (organice--groups
                '((:name "Sin proyecto" :pred organice--item-loose-p :order 0)
                  (:auto-map organice--item-project-title :order 1))))
      (organice--block 'tags "LEVEL>0" title fn
                       '(org-agenda-sorting-strategy
                         '(priority-down deadline-up scheduled-up alpha-up))))))

(defun organice--not-habit-nor-repeat-p (item)
  (not (or (organice-item-habit-p item) (organice-item-repeats-p item))))

(defun organice--custom-commands ()
  (let ((focus (organice--block 'tags-todo "LEVEL>0" "★ Focus" 'organice-focus-p
                                '(org-agenda-sorting-strategy
                                  '(priority-down deadline-up scheduled-up alpha-up))))
        (scheduled (apply #'organice--block 'tags "LEVEL>0" "📅 Scheduled"
                          'organice-scheduled-view-p
                          '(org-agenda-sorting-strategy '(scheduled-up alpha-up))
                          (organice--groups
                           '((:name "Programadas" :pred organice--not-habit-nor-repeat-p :order 1)
                             (:name "↻ Se repiten" :pred organice-item-repeats-p :order 2)
                             (:name "⟳ Hábitos" :pred organice-item-habit-p :order 3)))))
        (deadline (organice--block 'tags-todo "LEVEL>0" "⚑ Deadline" 'organice-deadline-view-p
                                   '(org-agenda-sorting-strategy '(deadline-up alpha-up))))
        (projects (apply #'organice--block 'todo "PROJECT" "Todos los proyectos" nil
                         '(org-agenda-sorting-strategy '(scheduled-up deadline-up alpha-up))
                         (organice--groups
                          '((:name "Activos" :pred organice--project-active-p :order 1)
                            (:name "Programados" :pred organice--project-scheduled-p :order 2)
                            (:name "Dormidos" :pred organice--project-sleep-p :order 3)))))
        ;; (2.15) Como la app: por secciones de estado (Next, Todo, Waiting, Programadas, Someday),
        ;; en el orden del fichero, con las que ya han llegado a su fecha primero
        (project-actions (apply #'organice--block 'todo "" "Acciones del proyecto"
                                'organice--project-action-p
                                '(org-agenda-sorting-strategy '(user-defined-up))
                                '(org-agenda-cmp-user-defined #'organice--cmp-due-first)
                                (organice--groups
                                 '((:name "Programadas" :pred organice--item-future-p :order 4)
                                   (:name "Next" :todo "NEXT" :order 1)
                                   (:name "Todo" :todo "TODO" :order 2)
                                   (:name "Waiting" :todo "WAITING" :order 3)
                                   (:name "Someday" :todo "MAYBE" :order 5)
                                   (:name "Otras" :anything t :order 6)))))
        (logbook (apply #'organice--block 'tags "LEVEL>0" "✓ Logbook (terminadas sin archivar)"
                        'organice--done-p
                        '(org-agenda-sorting-strategy '(alpha-up))
                        (organice--groups
                         '((:name "Esta semana" :pred organice--closed-week-p :order 1)
                           (:name "La semana pasada" :pred organice--closed-lastweek-p :order 2)
                           (:name "El mes pasado" :pred organice--closed-lastmonth-p :order 3)
                           (:name "Este año" :pred organice--closed-year-p :order 4)
                           (:name "Anteriores" :anything t :order 5))))))
    `(("g" . "ORGanice · vista GTD")
      ("gf" "Focus" (,focus))
      ("gi" "Inbox" (,(organice--list-block "📥 Inbox" 'inbox)))
      ("gn" "Next" (,(organice--list-block "▶ Next" 'next)))
      ("gt" "Todo" (,(organice--list-block "⏩ Todo" 'later)))
      ("gw" "Waiting" (,(organice--list-block "⏳ Waiting" 'waiting)))
      ("gs" "Scheduled" (,scheduled))
      ("gd" "Deadline" (,deadline))
      ("gm" "Someday" (,(organice--list-block "☁ Someday" 'someday)))
      ("gp" "Todos los proyectos" (,projects))
      ("gP" "Acciones del proyecto (desde el proyecto: C-c g P)" (,project-actions))
      ("gr" "Reference" (,(organice--list-block "📄 Reference" 'reference)))
      ("gl" "Logbook" (,logbook))
      ("ga" "Agenda (semana)" agenda ""
       ((org-agenda-span 'week)
        (org-agenda-start-on-weekday 1)))
      ("gg" "Tablero: Focus + Inbox + Next"
       (,focus
        ,(organice--list-block "📥 Inbox" 'inbox)
        ,(organice--list-block "▶ Next" 'next))))))

(defun organice--project-active-p (item) (organice--at-item item (eq (organice-project-state) 'active)))
(defun organice--project-scheduled-p (item) (organice--at-item item (eq (organice-project-state) 'scheduled)))
(defun organice--project-sleep-p (item) (organice--at-item item (eq (organice-project-state) 'sleep)))
(defun organice--closed-week-p (item) (eq (organice--logbook-group (organice--closed-days item)) 'week))
(defun organice--closed-lastweek-p (item) (eq (organice--logbook-group (organice--closed-days item)) 'lastweek))
(defun organice--closed-lastmonth-p (item) (eq (organice--logbook-group (organice--closed-days item)) 'lastmonth))
(defun organice--closed-year-p (item) (eq (organice--logbook-group (organice--closed-days item)) 'year))

(setq org-agenda-custom-commands (organice--custom-commands)
      org-agenda-start-on-weekday 1
      org-agenda-window-setup 'current-window
      org-agenda-restore-windows-after-quit t
      org-agenda-skip-scheduled-if-done t
      org-agenda-skip-deadline-if-done t
      org-agenda-todo-ignore-scheduled nil
      org-agenda-tags-column -100
      org-agenda-block-separator ?─
      org-stuck-projects '("TODO=\"PROJECT\"-sleep" ("NEXT") nil ""))

(when (organice--super-agenda-p) (org-super-agenda-mode 1))

;; Proyecto concreto: sus acciones abiertas (como la vista de un proyecto de la app). Desde la
;; 2.15 también las programadas a futuro (van en su sección «Programadas»).
(defun organice--project-action-p ()
  (and (organice--kw) (not (organice--done-p)) (not (organice--project-p))
       (not (memq (organice--hidden-by 'projects) '(parked habit)))))

(defun organice--item-future-p (item) (organice--at-item item (organice--future-scheduled-p)))

(defun organice--item-due-p (item)
  "¿Ha llegado ya (hoy o antes) su fecha programada o su fecha límite?"
  (organice--at-item
   item
   (let ((today (org-today)))
     (cl-some (lambda (prop)
                (let ((v (org-entry-get (point) prop)))
                  (and v (<= (time-to-days (org-time-string-to-time v)) today))))
              '("SCHEDULED" "DEADLINE")))))

(defun organice--cmp-due-first (a b)
  "Dentro de un proyecto las fechas no cambian el orden (el del fichero), salvo las que ya han
llegado, que van primero."
  (let ((da (organice--item-due-p a)) (db (organice--item-due-p b)))
    (cond ((and da (not db)) -1)
          ((and db (not da)) 1)
          (t nil))))

(defun organice-project-view ()
  "Acciones abiertas del PROJECT en el que está el punto (en un fichero .org)."
  (interactive)
  (unless (derived-mode-p 'org-mode) (user-error "Ponte en un proyecto de un fichero .org"))
  (save-excursion
    (org-back-to-heading t)
    (while (and (not (organice--project-p)) (org-up-heading-safe)))
    (unless (organice--project-p) (user-error "No estás dentro de un PROJECT"))
    (org-agenda nil "gP" 'subtree)))

;;;; ★ automática al llegar la fecha (como la app, una sola vez) --------------------------------

(defvar organice--auto-star-file (locate-user-emacs-file "organice-auto-star.eld"))
(defvar organice--auto-star-done nil)

(defun organice--auto-star-load ()
  (setq organice--auto-star-done
        (when (file-exists-p organice--auto-star-file)
          (with-temp-buffer (insert-file-contents organice--auto-star-file)
                            (ignore-errors (read (current-buffer)))))))

(defun organice--auto-star-save ()
  (with-temp-file organice--auto-star-file
    (prin1 (seq-take organice--auto-star-done 1000) (current-buffer))))

(defun organice--auto-star-key ()
  (let ((today (org-today)) (s (organice--scheduled)) (d (organice--deadline)))
    (format "%s|%s|%s|%s" (buffer-file-name (buffer-base-buffer)) (org-get-heading t t t t)
            (if (and s (<= s today)) s "") (if (and d (<= d today)) d ""))))

(defun organice-auto-star ()
  "Pone ★ [#A] a las tareas cuya fecha ha llegado (una sola vez por tarea y fecha)."
  (interactive)
  (when (and organice-auto-star (organice--opt 'focus :auto-star t))
    (unless organice--auto-star-done (organice--auto-star-load))
    (let ((today (org-today)) (changed 0))
      (org-map-entries
       (lambda ()
         (let ((s (organice--scheduled)) (d (organice--deadline)))
           (when (and (organice--kw) (not (organice--done-p)) (not (organice--project-p))
                      (not (organice--habit-p)) (not (organice--parked-p))
                      (not (eq (organice--priority) ?A))
                      (or (and s (<= s today)) (and d (<= d today))))
             (let ((key (organice--auto-star-key)))
               (unless (member key organice--auto-star-done)
                 (push key organice--auto-star-done)
                 (org-priority ?A)
                 (setq changed (1+ changed)))))))
       nil 'agenda)
      (when (> changed 0)
        (organice--auto-star-save)
        (org-save-all-org-buffers)
        (message "★ automática: %d tarea(s)" changed)))))

;;;; Abrir las vistas -------------------------------------------------------------------------

(defvar organice-last-gtd-view "gf" "Última vista GTD abierta.")

(defun organice-gtd (&optional key)
  "Abre una vista GTD (KEY: \"gf\" Focus, \"gi\" Inbox…); sin KEY, pregunta."
  (interactive)
  (organice-refresh-agenda-files)
  (setq org-agenda-custom-commands (organice--custom-commands))
  (ignore-errors (organice-auto-star))
  (if key
      (progn (setq organice-last-gtd-view key) (org-agenda nil key))
    (org-agenda nil "g")))

(defun organice-gtd-focus () (interactive) (organice-gtd "gf"))
(defun organice-gtd-inbox () (interactive) (organice-gtd "gi"))
(defun organice-gtd-next () (interactive) (organice-gtd "gn"))
(defun organice-gtd-todo () (interactive) (organice-gtd "gt"))
(defun organice-gtd-waiting () (interactive) (organice-gtd "gw"))
(defun organice-gtd-scheduled () (interactive) (organice-gtd "gs"))
(defun organice-gtd-deadline () (interactive) (organice-gtd "gd"))
(defun organice-gtd-someday () (interactive) (organice-gtd "gm"))
(defun organice-gtd-projects () (interactive) (organice-gtd "gp"))
(defun organice-gtd-reference () (interactive) (organice-gtd "gr"))
(defun organice-gtd-logbook () (interactive) (organice-gtd "gl"))
(defun organice-gtd-agenda () (interactive) (organice-gtd "ga"))

;;;; Modos Documentos ⇄ GTD (como el conmutador de la app) ------------------------------------

(defvar organice--last-document nil "Último buffer de documento antes de ir a GTD.")

(defun organice-toggle-mode ()
  "Cambia entre Documentos (el último fichero) y la vista GTD (la última lista)."
  (interactive)
  (if (derived-mode-p 'org-agenda-mode)
      (if (buffer-live-p organice--last-document)
          (switch-to-buffer organice--last-document)
        (dired organice-directory))
    (setq organice--last-document (current-buffer))
    (organice-gtd organice-last-gtd-view)))

;;;; Acciones como en la vista GTD ------------------------------------------------------------

(defun organice-toggle-star ()
  "Pone o quita la ★ [#A] (en un fichero o en la agenda)."
  (interactive)
  (if (derived-mode-p 'org-agenda-mode)
      (org-agenda-priority (if (eq (organice--at-agenda-priority) ?A) 'remove ?A))
    (org-priority (if (eq (organice--priority) ?A) 'remove ?A))))

(defun organice--at-agenda-priority ()
  (let ((m (org-get-at-bol 'org-hd-marker)))
    (when m (with-current-buffer (marker-buffer m)
              (org-with-wide-buffer (goto-char m) (organice--priority))))))

(defun organice-set-sleep (&optional wake)
  "Duerme (:sleep:) o despierta (con prefijo) el proyecto del punto."
  (interactive "P")
  (org-toggle-tag "sleep" (if wake 'off 'on)))

(defun organice-close-project (state)
  "Cierra el PROJECT del punto como DONE o CANCELLED (y, si se quiere, sus tareas abiertas)."
  (interactive (list (completing-read "Cerrar el proyecto como: " '("DONE" "CANCELLED") nil t)))
  (save-excursion
    (org-back-to-heading t)
    (unless (organice--project-p) (user-error "Esto no es un PROJECT"))
    (when (y-or-n-p "¿Cancelar también sus tareas sin hacer? ")
      (org-map-entries (lambda () (when (and (organice--kw) (not (organice--done-p))
                                            (not (organice--project-p)))
                                   (org-todo "CANCELLED")))
                       nil 'tree))
    (org-toggle-tag "sleep" 'off)
    (org-todo state)))

(defun organice--open-subtasks-p ()
  (save-excursion
    (org-back-to-heading t)
    (let ((end (save-excursion (org-end-of-subtree t t))) open)
      (while (and (not open) (outline-next-heading) (< (point) end))
        (when (and (organice--kw) (not (organice--done-p))) (setq open t)))
      open)))

(defun organice-archive-done ()
  "Archiva las tareas terminadas del fichero (como «Archivar todas» del Logbook).
Las que tienen alguna subtarea abierta no se archivan (como en la app)."
  (interactive)
  (let ((n 0) (blocked 0))
    (org-map-entries
     (lambda ()
       (if (organice--open-subtasks-p)
           (setq blocked (1+ blocked))
         (org-archive-subtree)
         (setq n (1+ n))
         (setq org-map-continue-from (org-element-property :begin (org-element-at-point)))))
     "/DONE|CANCELLED" 'file)
    (message "Archivadas: %d%s" n (if (> blocked 0) (format " · %d con subtareas abiertas" blocked) ""))))

(provide 'organice-gtd)
;;; organice-gtd.el ends here
