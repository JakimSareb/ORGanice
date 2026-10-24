;;; organice-tickler.el --- ORGanice: el Tickler (tickler.org) como en la app  -*- lexical-binding: t; -*-

;; (4.17) Igual que la app (3.40 y 4.17):
;;   * *[ TICKLER 2026 ]*        ← un año (en el orden que ya tenga el fichero; nuevos arriba)
;;   ** DICIEMBRE … ** ENERO     ← sus meses, de diciembre a enero
;;   *** Llamar al seguro        ← entradas SIN estado, con SCHEDULED = el día del recordatorio
;; Año y mes se crean solos si faltan. El día que toca, la entrada sale en «Tickler de hoy» de la
;; Revisión diaria, que la pasa al Inbox.
;;
;; C-c g T  vista Tickler: entradas agrupadas por cuándo aparecen (hoy o antes, mañana, cada día de
;;          este mes, los meses siguientes, sin fecha), con Fecha, +1 d / +1 s / +1 m, → Inbox,
;;          → Next y Borrar; RET en el título la abre para editarla; «＋ Añadir» una nueva.
;; C-c g k… (en Procesar Inbox) o M-x organice-to-tickler: manda la tarea del punto al Tickler.

(require 'org)
(require 'calendar)
(require 'ucs-normalize)
(require 'organice-core)
(require 'organice-proc)

(defconst organice-tickler-months
  ["ENERO" "FEBRERO" "MARZO" "ABRIL" "MAYO" "JUNIO" "JULIO" "AGOSTO" "SEPTIEMBRE" "OCTUBRE"
   "NOVIEMBRE" "DICIEMBRE"])

(defun organice-tickler--plain (s)
  "Título sin tildes, sin * [ ] y en mayúsculas (como la app)."
  (let ((s (ucs-normalize-NFD-string (or s ""))))
    (setq s (replace-regexp-in-string "[̀-ͯ]" "" s))
    (setq s (replace-regexp-in-string "[][*]" " " s))
    (upcase (string-trim (replace-regexp-in-string "[ \t]+" " " s)))))

(defun organice-tickler--year-of (title)
  (let ((p (organice-tickler--plain title)))
    (and (string-match "\\`TICKLER \\([0-9]\\{4\\}\\)\\'" p) (string-to-number (match-string 1 p)))))

(defun organice-tickler--month-of (title)
  "0–11, o nil."
  (let ((p (organice-tickler--plain title)))
    (when (equal p "SETIEMBRE") (setq p "SEPTIEMBRE"))
    (seq-position organice-tickler-months p)))

(defun organice-tickler--container-p (title)
  (or (organice-tickler--year-of title) (organice-tickler--month-of title)))

(defun organice-tickler--ensure-file ()
  "Buffer de tickler.org; si no existe, pregunta si crearlo (como la app)."
  (let ((path (organice-tickler-path)))
    (unless (file-exists-p path)
      (unless (y-or-n-p (format "No existe %s. ¿Crearlo? " organice-tickler-file))
        (user-error "Sin fichero del Tickler"))
      (with-temp-file path (insert "#+TITLE: Tickler\n\n"))
      (organice-refresh-agenda-files))
    (find-file-noselect path)))

(defun organice-tickler--date-parts (date)
  "DATE (\"2026-10-24\" o día absoluto) → (AÑO MES0 DÍA)."
  (let* ((abs (if (stringp date) (time-to-days (org-time-string-to-time date)) date))
         (g (calendar-gregorian-from-absolute abs)))
    (list (nth 2 g) (1- (car g)) (cadr g))))

(defun organice-tickler-month-marker (date)
  "Marcador del mes de DATE en tickler.org; crea el año y el mes si faltan (como la app)."
  (pcase-let ((`(,y ,m ,_) (organice-tickler--date-parts date)))
    (with-current-buffer (organice-tickler--ensure-file)
      (org-with-wide-buffer
       (let* ((min-level (let (lv) (org-map-entries (lambda () (setq lv (min (or lv 99) (org-outline-level))))
                                                    nil 'file)
                              (or lv 1)))
              (years nil) year-pos)
         (org-map-entries
          (lambda () (when (= (org-outline-level) min-level)
                       (let ((yy (organice-tickler--year-of (org-get-heading t t t t))))
                         (when yy (push (cons yy (point)) years)))))
          nil 'file)
         (setq years (nreverse years))
         (setq year-pos (cdr (assoc y years)))
         (unless year-pos
           (let* ((ascending (and (>= (length years) 2) (< (caar years) (car (car (last years))))))
                  (before (seq-find (lambda (e) (if ascending (> (car e) y) (< (car e) y))) years))
                  (title (format "*[ TICKLER %d ]*" y)))
             (cond (before (goto-char (cdr before)))
                   (years (goto-char (cdr (car (last years)))) (org-end-of-subtree t t))
                   (t (goto-char (point-max))))
             (unless (bolp) (insert "\n"))
             (setq year-pos (point))
             (insert (make-string min-level ?*) " " title "\n")))
         (goto-char year-pos)
         (let* ((ylevel (org-outline-level))
                (yend (save-excursion (org-end-of-subtree t t) (point)))
                kids month-pos)
           (save-excursion
             (while (and (outline-next-heading) (< (point) yend))
               (when (= (org-outline-level) (1+ ylevel))
                 (push (cons (organice-tickler--month-of (org-get-heading t t t t)) (point)) kids))))
           (setq kids (nreverse kids))
           (setq month-pos (cdr (seq-find (lambda (k) (eql (car k) m)) kids)))
           (unless month-pos
             (let ((next (seq-find (lambda (k) (and (car k) (< (car k) m))) kids)))
               (if next
                   (goto-char (cdr next))
                 (goto-char year-pos) (org-end-of-subtree t t))
               (unless (bolp) (insert "\n"))
               (setq month-pos (point))
               (insert (make-string (1+ ylevel) ?*) " " (aref organice-tickler-months m) "\n")))
           (save-buffer)
           (copy-marker month-pos)))))))

(defun organice--to-tickler (marker date)
  "Manda MARKER al Tickler en DATE (\"AAAA-MM-DD\" o \"AAAA-MM-DD HH:MM\"): sin estado, con
SCHEDULED y bajo su mes. Devuelve el marcador nuevo."
  (organice-at marker
    (when (organice--kw) (let ((organice-no-subtask-question t)) (org-todo 'none)))
    (org-schedule nil date))
  (organice-save marker)
  (organice-refile-to marker (organice-tickler-month-marker (substring date 0 10))))

(defun organice-to-tickler ()
  "Manda al Tickler la tarea del punto (en un fichero o en la agenda), con el día que elijas."
  (interactive)
  (let ((m (if (derived-mode-p 'org-agenda-mode)
               (or (org-get-at-bol 'org-hd-marker) (user-error "Ponte en una tarea"))
             (save-excursion (org-back-to-heading t) (point-marker))))
        (date (org-read-date t nil nil "¿Cuándo te lo recuerdo? ")))
    (organice--to-tickler m date)
    (message "→ Tickler (%s)" date)))

;;;; Entradas, grupos y fechas rápidas --------------------------------------------------------------

(defun organice-tickler-entry-p ()
  "¿Es una entrada del Tickler? (no las cabeceras de año/mes ni notas sueltas sin fecha)."
  (and (not (organice--done-p)) (not (organice--project-p))
       (not (organice-tickler--container-p (org-get-heading t t t t)))
       (or (organice--scheduled) (<= (org-outline-level) 3))))

(defun organice-tickler-entries ()
  (when (file-exists-p (organice-tickler-path))
    (organice-collect #'organice-tickler-entry-p (list (organice-tickler-path)))))

(defun organice-tickler-today ()
  "Entradas del Tickler que tocan hoy o antes."
  (seq-filter (lambda (m) (let ((s (organice-at m (organice--scheduled))))
                            (and s (<= s (org-today)))))
              (organice-tickler-entries)))

(defun organice-tickler-groups ()
  "((ETIQUETA . MARCADORES) …): hoy (o antes), mañana, días de este mes, meses, sin fecha."
  (let* ((today (org-today))
         (tg (calendar-gregorian-from-absolute today))
         groups)
    (dolist (m (organice-tickler-entries))
      (let* ((s (organice-at m (organice--scheduled)))
             (key
              (cond ((null s) (list most-positive-fixnum "Sin fecha"))
                    ((<= s today) (list -2 "Hoy (o antes)"))
                    ((= s (1+ today)) (list -1 "Mañana"))
                    (t (let ((g (calendar-gregorian-from-absolute s)))
                         (if (and (= (car g) (car tg)) (= (nth 2 g) (nth 2 tg)))
                             (list s (format "%s %d" (calendar-day-name g) (cadr g)))
                           (let ((first (calendar-absolute-from-gregorian (list (car g) 1 (nth 2 g)))))
                             (list first (format "%s %d"
                                                 (capitalize (aref organice-tickler-months (1- (car g))))
                                                 (nth 2 g)))))))))
             (cell (assoc key groups)))
        (if cell (setcdr cell (append (cdr cell) (list m))) (push (cons key (list m)) groups))))
    (mapcar (lambda (g) (cons (cadr (car g)) (organice-sort-by-date (cdr g))))
            (sort groups (lambda (a b) (< (caar a) (caar b)))))))

(defun organice-tickler-shift (abs unit n)
  "Día absoluto ABS más N días/semanas/meses (UNIT day, week, month); nunca antes de hoy.
Al sumar meses, si el día no existe (31 → febrero) se queda en el último del mes."
  (let* ((base (or abs (org-today)))
         (out (if (eq unit 'month)
                  (let* ((g (calendar-gregorian-from-absolute base))
                         (mm (+ (1- (car g)) n))
                         (yy (+ (nth 2 g) (floor mm 12)))
                         (mo (1+ (mod mm 12)))
                         (last (calendar-last-day-of-month mo yy)))
                    (calendar-absolute-from-gregorian (list mo (min (cadr g) last) yy)))
                (+ base (* n (if (eq unit 'week) 7 1))))))
    (max out (org-today))))

(defun organice--abs-to-date (abs)
  (let ((g (calendar-gregorian-from-absolute abs)))
    (format "%04d-%02d-%02d" (nth 2 g) (car g) (cadr g))))

(defun organice-tickler-reschedule (m abs)
  "Otra fecha: en el mismo mes solo cambia SCHEDULED; si cambia de mes, se mueve bajo el nuevo."
  (let* ((old (organice-at m (organice--scheduled)))
         (same (and old (equal (butlast (organice-tickler--date-parts old))
                               (butlast (organice-tickler--date-parts abs))))))
    (if same
        (progn (organice-at m (org-schedule nil (organice--abs-to-date abs))) (organice-save m))
      (organice--to-tickler m (organice--abs-to-date abs)))))

;;;; La vista ----------------------------------------------------------------------------------------

(defun organice-tickler--shift-action (unit label)
  (cons label (lambda (m)
                (organice-tickler-reschedule
                 m (organice-tickler-shift (organice-at m (organice--scheduled)) unit 1))
                label)))

(defun organice-tickler--to-next (m)
  "→ Next: al fichero de tareas, con NEXT y sin SCHEDULED."
  (let ((nm (organice-refile-to m (organice-tasks-path) t)))
    (organice-at nm (org-schedule '(4)) (org-todo "NEXT"))
    (organice-save nm)
    "→ Next"))

(defun organice-tickler--delete (m)
  (when (yes-or-no-p (format "¿Borrar «%s» del Tickler? " (organice-title m)))
    (organice-at m (org-cut-subtree))
    (organice-save m)
    "Borrada"))

(defconst organice-tickler-actions
  (list (cons "Fecha…" (lambda (m)
                         (organice-tickler-reschedule
                          m (time-to-days (org-read-date nil t nil "Nueva fecha: ")))
                         "Fecha"))
        (organice-tickler--shift-action 'day "+1 d")
        (organice-tickler--shift-action 'week "+1 s")
        (organice-tickler--shift-action 'month "+1 m")
        (cons "→ Inbox" #'organice-act-inbox)
        (cons "→ Next" #'organice-tickler--to-next)
        (cons "Borrar" #'organice-tickler--delete)))

(defun organice-tickler-add (&optional title date)
  "Entrada nueva del Tickler (título y fecha) bajo su mes."
  (interactive)
  (let* ((title (or title (read-string "Recordarme: ")))
         (date (or date (org-read-date nil nil nil "¿Qué día? "))))
    (unless (string-empty-p (string-trim title))
      (let ((month (organice-tickler-month-marker date)))
        (organice-at (organice-add-child month (string-trim title))
          (org-schedule nil date)
          (save-buffer)))
      (message "→ Tickler (%s): %s" date title))))

(defun organice-tickler--insert ()
  (let ((groups (organice-tickler-groups)))
    (if (null groups)
        (insert (propertize "El Tickler está vacío." 'face 'shadow) "\n")
      (dolist (g groups)
        (insert (propertize (format "%s  (%d)" (car g) (length (cdr g))) 'face 'organice-proc-step) "\n")
        (dolist (m (cdr g)) (organice-proc--item-line m organice-tickler-actions))
        (insert "\n")))))

(defun organice-tickler ()
  "Vista Tickler (4.17): las entradas de tickler.org agrupadas por cuándo aparecen."
  (interactive)
  (organice-tickler--ensure-file)
  (organice-proc-start
   "Tickler"
   (list (list :label (format "Entradas de %s" organice-tickler-file)
               :hint "El día que toca, cada entrada sale en «Tickler de hoy» de la Revisión diaria, que la pasa al Inbox."
               :buttons (list (cons "＋ Añadir" #'organice-tickler-add))
               :insert #'organice-tickler--insert))))

(provide 'organice-tickler)
;;; organice-tickler.el ends here
