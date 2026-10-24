;;; organice-proc.el --- ORGanice: tarjetas paso a paso para los procesos de GTD  -*- lexical-binding: t; -*-

;; (4.17) Lo común de los procesos guiados (Revisión diaria, semanal, de horizontes, repasos…) y de
;; las vistas con acciones (Tickler, Horizontes): una «tarjeta» en su propio buffer, como las de la
;; app, con el paso actual, su pista, botones y las tareas del paso con sus acciones al lado.
;;
;; En la tarjeta: n / SPC paso siguiente · p anterior · TAB salta entre botones · RET pulsa el
;; botón (en el título de una tarea, la abre) · a apuntar algo al Inbox · g recalcular · q salir.

(require 'org)
(require 'cl-lib)
(require 'seq)
(require 'subr-x)
(require 'organice-core)
(require 'organice-gtd)

;;;; Tareas: recoger, mirar y cambiar -------------------------------------------------------------

(defmacro organice-at (marker &rest body)
  "BODY en el encabezado de MARKER (con el buffer ampliado)."
  (declare (indent 1))
  `(let ((m ,marker))
     (when (and (markerp m) (marker-buffer m))
       (with-current-buffer (marker-buffer m)
         (org-with-wide-buffer (goto-char m) (org-back-to-heading t) ,@body)))))

(defun organice-collect (pred &optional files)
  "Marcadores de los encabezados de FILES (por defecto, los de la agenda) que cumplen PRED.
PRED se llama en el encabezado. Lo que está en la Papelera (:trash:) no sale nunca."
  (organice-refresh-agenda-files)
  (let (out)
    (dolist (f (or files (org-agenda-files)))
      (when (file-exists-p f)
        (with-current-buffer (org-get-agenda-file-buffer f)
          (org-with-wide-buffer
           (org-map-entries
            (lambda ()
              (when (and (not (organice--trashed-p))
                         (condition-case nil (funcall pred) (error nil)))
                (push (point-marker) out)))
            nil 'file)))))
    (nreverse out)))

(defun organice-title (marker)
  (or (organice-at marker (org-get-heading t t t t)) "?"))

(defun organice-file-of (marker)
  (and (marker-buffer marker)
       (file-name-nondirectory (or (buffer-file-name (marker-buffer marker)) ""))))

(defun organice-first-date (marker)
  "Primer día (absoluto) entre la fecha límite y la programada de MARKER, o nil."
  (organice-at marker
    (let ((ds (delq nil (list (organice--deadline) (organice--scheduled)))))
      (and ds (apply #'min ds)))))

(defun organice-sort-by-date (markers)
  (sort (copy-sequence markers)
        (lambda (a b)
          (let ((da (or (organice-first-date a) most-positive-fixnum))
                (db (or (organice-first-date b) most-positive-fixnum)))
            (if (= da db)
                (string-collate-lessp (organice-title a) (organice-title b) nil t)
              (< da db))))))

(defun organice-sort-by-title (markers)
  (sort (copy-sequence markers)
        (lambda (a b) (string-collate-lessp (organice-title a) (organice-title b) nil t))))

(defun organice-open-action-p ()
  "Acción abierta: con estado, sin terminar, no PROJECT."
  (and (organice--kw) (not (organice--done-p)) (not (organice--project-p))))

(defun organice-save (marker)
  (when (and (markerp marker) (marker-buffer marker))
    (with-current-buffer (marker-buffer marker) (save-buffer))))

(defun organice-visit (marker)
  "Abre el encabezado de MARKER en la otra ventana."
  (unless (and (markerp marker) (marker-buffer marker)) (user-error "Ya no está; pulsa g"))
  (let ((buf (marker-buffer marker)))
    (pop-to-buffer buf '((display-buffer-use-some-window display-buffer-pop-up-window)
                         (inhibit-same-window . t)))
    (widen)
    (goto-char marker)
    (org-fold-show-context)
    (org-fold-show-entry)
    (recenter 3)))

(defun organice-capture-inbox (title &optional notes)
  "Apunta TITLE (con NOTES) al final del fichero de entrada, sin estado, con :CREATED:."
  (when (and title (not (string-empty-p (string-trim title))))
    (with-current-buffer (find-file-noselect (organice-inbox-path))
      (org-with-wide-buffer
       (goto-char (point-max))
       (unless (bolp) (insert "\n"))
       (insert "* " (string-trim title) "\n")
       (forward-line -1)
       (organice-set-created)
       (when (and notes (not (string-empty-p (string-trim notes))))
         (org-end-of-meta-data t)
         (insert (string-trim notes) "\n")))
      (save-buffer))
    (message "→ Inbox: %s" title)
    t))

(defun organice-add-child (parent title &optional state tags)
  "Añade bajo PARENT (marcador) una tarea TITLE con STATE y TAGS, al final de sus hijas.
Devuelve el marcador de la nueva."
  (organice-at parent
    (let ((level (1+ (org-outline-level))))
      (org-end-of-subtree t t)
      (unless (bolp) (insert "\n"))
      (insert (make-string level ?*) " " (if state (concat state " ") "") title "\n")
      (forward-line -1)
      (when tags (org-set-tags tags))
      (organice-set-created)
      (prog1 (point-marker) (save-buffer)))))

(defun organice-refile-to (marker target &optional top-level)
  "Mueve el subárbol de MARKER bajo TARGET (marcador) o, con TOP-LEVEL, al final del fichero
TARGET (ruta). Devuelve el marcador nuevo."
  (organice-at marker
    (let ((src (current-buffer)))
      (org-cut-subtree)
      (with-current-buffer src (save-buffer))))
  (if top-level
      (with-current-buffer (find-file-noselect target)
        (org-with-wide-buffer
         (goto-char (point-max))
         (unless (bolp) (insert "\n"))
         (let ((pos (point)))
           (org-paste-subtree 1)
           (save-buffer)
           (goto-char pos)
           (point-marker))))
    (organice-at target
      (let ((level (1+ (org-outline-level))))
        (org-end-of-subtree t t)
        (unless (bolp) (insert "\n"))
        (let ((pos (point)))
          (org-paste-subtree level)
          (save-buffer)
          (goto-char pos)
          (point-marker))))))

;;;; Acciones de una tarea (las de las tarjetas de la app) ----------------------------------------

(defun organice-act-done (m)
  (organice-at m (let ((organice-no-subtask-question nil)) (org-todo "DONE")))
  (organice-save m) "Hecha")

(defun organice-act-tomorrow (m)
  "→ mañana: programada para mañana y sin ★ (vuelve sola ese día)."
  (organice-at m
    (org-schedule nil "+1d")
    (when (eq (organice--priority) ?A) (org-priority 'remove)))
  (organice-save m) "Para mañana")

(defun organice-act-date (m)
  (let ((d (org-read-date nil nil nil "Nueva fecha: ")))
    (organice-at m
      (org-schedule nil d)
      (when (eq (organice--priority) ?A) (org-priority 'remove))))
  (organice-save m) "Reprogramada")

(defun organice-act-next (m)
  (organice-at m (org-todo "NEXT")) (organice-save m) "→ Next")

(defun organice-act-trash (m)
  (when (y-or-n-p (format "¿A la Papelera «%s»? " (organice-title m)))
    (organice-at m (org-toggle-tag "trash" 'on))
    (organice-save m) "Papelera"))

(defun organice-act-star (m)
  (organice-at m (org-priority (if (eq (organice--priority) ?A) 'remove ?A)))
  (organice-save m) "★")

(defun organice-act-inbox (m)
  "→ Inbox (como «Al Inbox» de la app): sin estado al final del fichero de entrada."
  (organice-at m (when (organice--kw) (org-todo 'none)))
  (organice-refile-to m (organice-inbox-path) t)
  "→ Inbox")

;;;; La tarjeta ------------------------------------------------------------------------------------

(defvar-local organice-proc--title nil)
(defvar-local organice-proc--steps nil
  "Pasos: plists con :id :phase :label :hint y, opcionales, :items (función → marcadores),
:actions ((ETIQUETA . FUNCIÓN-DE-MARCADOR) …), :buttons ((ETIQUETA . FUNCIÓN) …),
:capture ETIQUETA (botón para apuntar al Inbox), :insert (función que dibuja lo suyo),
:empty (texto si no hay nada) y :on-leave (función al pasar al siguiente).")
(defvar-local organice-proc--index 0)
(defvar-local organice-proc--on-finish nil)
(defvar-local organice-proc--items nil)

(defface organice-proc-title '((t :weight bold :height 1.2)) "Título de la tarjeta." :group 'organice)
(defface organice-proc-step '((t :weight bold :height 1.1)) "Paso de la tarjeta." :group 'organice)
(defface organice-proc-hint '((t :inherit shadow :slant italic)) "Pista del paso." :group 'organice)
(defface organice-proc-button '((t :inherit link :underline nil :box (:line-width -1)))
  "Botones de la tarjeta." :group 'organice)

(defvar organice-proc-mode-map
  (let ((m (make-sparse-keymap)))
    (define-key m (kbd "n") #'organice-proc-next)
    (define-key m (kbd "SPC") #'organice-proc-next)
    (define-key m (kbd "p") #'organice-proc-previous)
    (define-key m (kbd "TAB") #'forward-button)
    (define-key m (kbd "<backtab>") #'backward-button)
    (define-key m (kbd "a") #'organice-proc-capture)
    (define-key m (kbd "g") #'organice-proc-refresh)
    (define-key m (kbd "q") #'organice-proc-quit)
    m))

(define-derived-mode organice-proc-mode special-mode "GTD·Proceso"
  "Tarjeta de un proceso de GTD de ORGanice."
  (setq-local truncate-lines nil)
  (visual-line-mode 1))

(defun organice-proc--button (label fn &optional face)
  (insert-text-button (concat " " label " ")
                      'action (lambda (_) (funcall fn))
                      'follow-link t
                      'face (or face 'organice-proc-button)
                      'help-echo label)
  (insert " "))

(defun organice-proc--item-line (m actions)
  "Una tarea: título (RET la abre), fichero y fechas, y sus botones."
  (let* ((title (organice-title m))
         (info (organice-at m
                 (let ((kw (organice--kw)) (star (eq (organice--priority) ?A))
                       (tags (org-get-tags nil t)))
                   (string-trim
                    (concat (if star "★ " "") (if kw (concat kw " ") "")
                            (organice-agenda-dates)
                            (if tags (concat "  :" (string-join tags ":") ":") "")))))))
    (insert "  • ")
    (insert-text-button title 'action (lambda (_) (organice-visit m)) 'follow-link t
                        'face 'bold 'help-echo "RET: abrir la tarea")
    (insert (propertize (format "   %s · %s" (or info "") (or (organice-file-of m) ""))
                        'face 'shadow)
            "\n    ")
    (dolist (a actions)
      (organice-proc--button (car a) (lambda () (organice-proc--run (cdr a) m))))
    (insert "\n")))

(defun organice-proc--run (fn m)
  (let ((buf (current-buffer))
        (title (organice-title m))
        (label (funcall fn m)))
    (when (stringp label) (message "%s: %s" label title))
    (when (buffer-live-p buf) (with-current-buffer buf (organice-proc-refresh)))))

(defun organice-proc-render ()
  (let* ((inhibit-read-only t)
         (pos (point))
         (n (length organice-proc--steps))
         (step (nth organice-proc--index organice-proc--steps)))
    (erase-buffer)
    (insert (propertize organice-proc--title 'face 'organice-proc-title) "\n")
    (when (> n 1)
      (insert (propertize (format "Paso %d de %d%s" (1+ organice-proc--index) n
                                  (if (plist-get step :phase)
                                      (concat " · " (plist-get step :phase)) ""))
                          'face 'shadow)
              "\n"))
    (insert "\n" (propertize (or (plist-get step :label) "") 'face 'organice-proc-step) "\n")
    (when (plist-get step :hint)
      (insert (propertize (plist-get step :hint) 'face 'organice-proc-hint) "\n"))
    (insert "\n")
    (let ((btns (append (plist-get step :buttons)
                        (when (plist-get step :capture)
                          (list (cons (plist-get step :capture) #'organice-proc-capture))))))
      (when btns
        (dolist (b btns)
          (let ((buf (current-buffer)))
            (organice-proc--button (car b) (lambda ()
                                             (funcall (cdr b))
                                             (when (buffer-live-p buf)
                                               (with-current-buffer buf (organice-proc-refresh)))))))
        (insert "\n\n")))
    (when (plist-get step :insert) (funcall (plist-get step :insert)))
    (when (plist-get step :items)
      (setq organice-proc--items (funcall (plist-get step :items)))
      (if (null organice-proc--items)
          (insert (propertize (or (plist-get step :empty) "Nada por aquí. ✓") 'face 'shadow) "\n")
        (insert (propertize (format "%d\n" (length organice-proc--items)) 'face 'shadow))
        (dolist (m organice-proc--items)
          (organice-proc--item-line m (plist-get step :actions)))))
    (insert "\n" (propertize
                  (concat (if (> n 1) "n siguiente · p anterior · " "")
                          "TAB botones · RET pulsar · a apuntar al Inbox · g recalcular · q salir")
                  'face 'shadow)
            "\n")
    (insert "\n")
    (when (> n 1)
      (unless (= organice-proc--index 0)
        (organice-proc--button "← Anterior" #'organice-proc-previous))
      (organice-proc--button (if (= organice-proc--index (1- n)) "Terminar ✓" "Siguiente →")
                             #'organice-proc-next))
    (goto-char (min pos (point-max)))))

(defun organice-proc-start (title steps &optional on-finish)
  "Abre la tarjeta TITLE con STEPS (ver `organice-proc--steps')."
  (let ((buf (get-buffer-create (format "*ORGanice · %s*" title))))
    (pop-to-buffer-same-window buf)
    (organice-proc-mode)
    (setq organice-proc--title title
          organice-proc--steps steps
          organice-proc--index 0
          organice-proc--on-finish on-finish)
    (organice-proc-render)
    (goto-char (point-min))
    buf))

(defun organice-proc-refresh ()
  (interactive)
  (when (derived-mode-p 'organice-proc-mode) (organice-proc-render)))

(defun organice-proc-next ()
  "Paso siguiente (o terminar)."
  (interactive)
  (let ((step (nth organice-proc--index organice-proc--steps)))
    (when (plist-get step :on-leave) (funcall (plist-get step :on-leave))))
  (if (< organice-proc--index (1- (length organice-proc--steps)))
      (progn (setq organice-proc--index (1+ organice-proc--index))
             (organice-proc-render)
             (goto-char (point-min)))
    (let ((fin organice-proc--on-finish))
      (organice-proc-quit)
      (when fin (funcall fin)))))

(defun organice-proc-previous ()
  (interactive)
  (when (> organice-proc--index 0)
    (setq organice-proc--index (1- organice-proc--index))
    (organice-proc-render)
    (goto-char (point-min))))

(defun organice-proc-capture ()
  "Apunta algo al Inbox sin salir de la tarjeta."
  (interactive)
  (organice-capture-inbox (read-string "Apuntar al Inbox: "))
  (organice-proc-refresh))

(defun organice-proc-quit ()
  (interactive)
  (org-save-all-org-buffers)
  (quit-window t))

(provide 'organice-proc)
;;; organice-proc.el ends here
