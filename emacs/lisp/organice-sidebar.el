;;; organice-sidebar.el --- ORGanice: menú lateral de la vista GTD, como en la app  -*- lexical-binding: t; -*-

;; Una columna fija a la izquierda con las secciones de la vista GTD (Agenda, Focus, Inbox,
;; Next…), cada una con su contador, y debajo los proyectos activos. Al elegir una, se abre a
;; la derecha; la columna se queda.
;;
;; - Sale sola al entrar en GTD (F12, C-c g …) y se va al volver a Documentos.
;; - C-c g b la muestra u oculta.
;; - En la columna: ↑ ↓ (o n / p) y Intro (o clic) abren; g actualiza los contadores; q la oculta.

(require 'org)
(require 'org-agenda)
(require 'seq)
(require 'cl-lib)
(require 'subr-x)
(require 'organice-core)
(require 'organice-gtd)

(defcustom organice-sidebar-width 30
  "Ancho del menú lateral (en caracteres)."
  :type 'integer :group 'organice)

(defcustom organice-sidebar-auto t
  "t: el menú lateral sale solo al entrar en la vista GTD y se va al volver a Documentos."
  :type 'boolean :group 'organice)

(defcustom organice-sidebar-items
  '(("ga" "📅" "Agenda"    nil)
    ("gf" "★"  "Focus"     focus)
    ("gi" "📥" "Inbox"     inbox)
    ("gn" "▶"  "Next"      next)
    ("gt" "⏩" "Todo"      later)
    ("gw" "⏳" "Waiting"   waiting)
    ("gs" "🗓" "Scheduled" scheduled)
    ("gd" "⚑"  "Deadline"  deadline)
    ("gm" "☁"  "Someday"   someday)
    ("gp" "◆"  "Proyectos" projects)
    ("gr" "📄" "Reference" reference)
    ("gl" "✔"  "Logbook"   nil))
  "Secciones del menú: (TECLA-DE-LA-VISTA ICONO NOMBRE CONTADOR).
CONTADOR es la lista que se cuenta (nil: sin contador)."
  :type '(repeat (list string string string symbol)) :group 'organice)

(defconst organice-sidebar-buffer "*ORGanice GTD*")

;;;; Contadores (una sola pasada por todos los ficheros) ----------------------------------------

(defvar organice-sidebar--counts nil "Alist (LISTA . Nº).")
(defvar organice-sidebar--projects nil "Lista de (TÍTULO . MARCADOR) de los proyectos activos.")

(defun organice-sidebar--compute ()
  "Cuenta las tareas de cada lista y recoge los proyectos activos."
  (let ((counts nil) (projects nil))
    (cl-flet ((bump (k) (setf (alist-get k counts) (1+ (alist-get k counts 0)))))
      (organice-refresh-agenda-files)
      (dolist (file (org-agenda-files))
        (when (file-exists-p file)
          (with-current-buffer (org-get-agenda-file-buffer file)
            (org-with-wide-buffer
             (org-map-entries
              (lambda ()
                (condition-case nil
                    (cond
                     ((organice--project-p)
                      (when (eq (organice-project-state) 'active)
                        (bump 'projects)
                        (push (cons (org-get-heading t t t t) (point-marker)) projects)))
                     ((organice--done-p) nil)
                     (t
                      (let ((l (organice-list-of)))
                        (when (memq l '(inbox next later waiting someday reference)) (bump l)))
                      (when (organice-focus-p) (bump 'focus))
                      (when (organice-scheduled-view-p) (bump 'scheduled))
                      (when (organice-deadline-view-p) (bump 'deadline))))
                  (error nil)))
              nil 'file))))))
    (setq organice-sidebar--counts counts
          organice-sidebar--projects
          (sort projects (lambda (a b) (string-collate-lessp (car a) (car b) nil t))))))

;;;; Dibujo ----------------------------------------------------------------------------------------

(defface organice-sidebar-current
  '((t :inherit highlight :weight bold :extend t))
  "Sección abierta en el menú lateral." :group 'organice)

(defface organice-sidebar-count
  '((t :inherit shadow))
  "Contadores del menú lateral." :group 'organice)

(defface organice-sidebar-title
  '((t :inherit shadow :weight bold))
  "Títulos del menú lateral («PROYECTOS»)." :group 'organice)

(defvar organice-sidebar--current nil "Clave de la vista o marcador del proyecto abierto.")

(defun organice-sidebar--line (label count action current)
  "Inserta una línea del menú."
  (let* ((cnt (if (and count (> count 0)) (number-to-string count) ""))
         (pad (max 1 (- organice-sidebar-width 3 (string-width label) (string-width cnt))))
         (start (point)))
    (insert " " label (make-string pad ?\s)
            (propertize cnt 'face 'organice-sidebar-count) " ")
    (make-text-button start (point)
                      'action (lambda (_) (funcall action))
                      'follow-link t
                      'face nil
                      'mouse-face 'highlight
                      'help-echo "Intro o clic: abrir")
    (when current
      (add-face-text-property start (point) 'organice-sidebar-current))
    (insert "\n")))

(defun organice-sidebar--render ()
  (with-current-buffer (get-buffer-create organice-sidebar-buffer)
    (let ((inhibit-read-only t)
          (line (line-number-at-pos)))
      (erase-buffer)
      (insert (propertize " ORGanice · GTD\n\n" 'face '(:weight bold :height 1.1)))
      (dolist (item organice-sidebar-items)
        (pcase-let ((`(,key ,icon ,name ,count) item))
          (organice-sidebar--line (format "%s  %s" icon name)
                                  (and count (alist-get count organice-sidebar--counts 0))
                                  (lambda () (organice-sidebar--open-view key))
                                  (equal organice-sidebar--current key))))
      (when organice-sidebar--projects
        (insert "\n" (propertize " PROYECTOS\n" 'face 'organice-sidebar-title))
        (dolist (p organice-sidebar--projects)
          (let ((m (cdr p)))
            (organice-sidebar--line (concat "   " (truncate-string-to-width
                                                     (car p) (- organice-sidebar-width 6) nil nil "…"))
                                    nil
                                    (lambda () (organice-sidebar--open-project m))
                                    (eq organice-sidebar--current m)))))
      (insert "\n" (propertize " g actualizar · q ocultar\n" 'face 'shadow))
      (goto-char (point-min))
      (forward-line (1- line)))))

(defun organice-sidebar-refresh ()
  "Vuelve a contar y a dibujar el menú lateral."
  (interactive)
  (organice-sidebar--compute)
  (organice-sidebar--render))

;;;; Abrir secciones y proyectos (en la ventana de la derecha) ----------------------------------

(defun organice-sidebar--main-window ()
  "La ventana principal (la que no es el menú lateral)."
  (or (seq-find (lambda (w) (not (window-parameter w 'window-side))) (window-list nil 'no-mini))
      (selected-window)))

(defun organice-sidebar--open-view (key)
  (select-window (organice-sidebar--main-window))
  (let ((org-agenda-window-setup 'current-window))
    (organice-gtd key)))

(defun organice-sidebar--open-project (marker)
  (unless (marker-buffer marker) (user-error "Ese proyecto ya no está; pulsa g"))
  (select-window (organice-sidebar--main-window))
  (setq organice-sidebar--current marker)
  (let ((org-agenda-window-setup 'current-window))
    (with-current-buffer (marker-buffer marker)
      (org-with-wide-buffer
       (goto-char marker)
       (org-agenda nil "gP" 'subtree))))
  (organice-sidebar--render))

;;;; Mostrar / ocultar -----------------------------------------------------------------------------

(defvar organice-sidebar-mode-map
  (let ((m (make-sparse-keymap)))
    (define-key m (kbd "RET") #'push-button)
    (define-key m (kbd "n") #'organice-sidebar-next)
    (define-key m (kbd "p") #'organice-sidebar-previous)
    (define-key m (kbd "<down>") #'organice-sidebar-next)
    (define-key m (kbd "<up>") #'organice-sidebar-previous)
    (define-key m (kbd "g") #'organice-sidebar-refresh)
    (define-key m (kbd "q") #'organice-sidebar-hide)
    (define-key m (kbd "<f12>") #'organice-toggle-mode)
    m))

(define-derived-mode organice-sidebar-mode special-mode "GTD"
  "Menú lateral de la vista GTD de ORGanice."
  (setq-local cursor-type nil
              truncate-lines t
              mode-line-format nil)
  (hl-line-mode 1))

(defun organice-sidebar-next ()
  (interactive)
  (forward-button 1 t))

(defun organice-sidebar-previous ()
  (interactive)
  (backward-button 1 t))

(defun organice-sidebar-window ()
  (get-buffer-window organice-sidebar-buffer))

(defun organice-sidebar-show ()
  "Muestra el menú lateral a la izquierda."
  (interactive)
  (let ((buf (get-buffer-create organice-sidebar-buffer)))
    (with-current-buffer buf
      (unless (derived-mode-p 'organice-sidebar-mode) (organice-sidebar-mode)))
    (unless organice-sidebar--counts (organice-sidebar--compute))
    (organice-sidebar--render)
    (unless (organice-sidebar-window)
      (display-buffer-in-side-window
       buf `((side . left) (slot . 0) (window-width . ,organice-sidebar-width)
             (preserve-size . (t . nil))
             (window-parameters . ((no-delete-other-windows . t)
                                   (no-other-window . t))))))))

(defun organice-sidebar-hide ()
  "Oculta el menú lateral."
  (interactive)
  (when-let ((w (organice-sidebar-window))) (delete-window w)))

(defun organice-sidebar ()
  "Muestra u oculta el menú lateral de la vista GTD."
  (interactive)
  (if (organice-sidebar-window) (organice-sidebar-hide) (organice-sidebar-show)))

;;;; Enganches: sale con GTD, se va con Documentos, y se actualiza solo ------------------------

(defun organice-sidebar--after-gtd (&optional key &rest _)
  (setq organice-sidebar--current (or key organice-last-gtd-view))
  (if (or organice-sidebar-auto (organice-sidebar-window))
      (organice-sidebar-show)
    (organice-sidebar--render)))
(advice-add 'organice-gtd :after #'organice-sidebar--after-gtd)

(defun organice-sidebar--after-toggle (&rest _)
  (when (and organice-sidebar-auto (not (derived-mode-p 'org-agenda-mode)))
    (organice-sidebar-hide)))
(advice-add 'organice-toggle-mode :after #'organice-sidebar--after-toggle)

;; Contadores al día: al sincronizar y, tras guardar un .org, cuando Emacs está libre
(defvar organice-sidebar--timer nil)
(defun organice-sidebar--schedule-refresh ()
  (when (and (derived-mode-p 'org-mode) (organice-sidebar-window))
    (when organice-sidebar--timer (cancel-timer organice-sidebar--timer))
    (setq organice-sidebar--timer
          (run-with-idle-timer 2 nil (lambda () (when (organice-sidebar-window)
                                                 (organice-sidebar-refresh)))))))
(add-hook 'after-save-hook #'organice-sidebar--schedule-refresh)

(with-eval-after-load 'organice-ui
  (advice-add 'organice-sync :after
              (lambda (&rest _) (when (organice-sidebar-window) (organice-sidebar-refresh)))))

(defun organice-sidebar-start (&optional key)
  "Abre la vista GTD KEY (por defecto la Agenda) con el menú lateral.
Sirve para `initial-buffer-choice': devuelve el buffer de la vista."
  (interactive)
  (organice-sidebar--open-view (or key "ga"))
  (current-buffer))

(provide 'organice-sidebar)
;;; organice-sidebar.el ends here
