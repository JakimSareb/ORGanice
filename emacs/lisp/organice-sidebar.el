;;; organice-sidebar.el --- ORGanice: menú lateral de la vista GTD, como en la app  -*- lexical-binding: t; -*-

;; Una columna fija a la izquierda con las secciones de la vista GTD (Agenda, Focus, Inbox,
;; Next…), cada una con su contador, y debajo los proyectos activos. Al elegir una, se abre a
;; la derecha; la columna se queda.
;;
;; - Sale sola al entrar en GTD (F12, C-c g …) y se va al volver a Documentos.
;; - C-c g b la muestra u oculta.
;; - Secciones (las de siempre y las propias): `organice-gtd-menu'.
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

;; Secciones de la vista GTD: las de siempre y las propias. Cada una:
;;   (TECLA ICONO NOMBRE . OPCIONES)
;; OPCIONES: :show nil (ocultarla), :count LISTA (qué contar; las de siempre) y, en las
;; secciones PROPIAS (TECLA nil), sus reglas: :tags, :states o :props, como en Ajustes de la
;; app. Una tarea abierta sale en una sección propia si cumple alguna regla (también por las
;; etiquetas que hereda de su tarea madre o de su proyecto); sigue además en su lista.
(defcustom organice-gtd-menu
  '(("ga" "📅" "Agenda")
    ("gf" "★"  "Focus"     :count focus)
    ("gi" "📥" "Inbox"     :count inbox)
    ("gn" "▶"  "Next"      :count next)
    ("gt" "⏩" "Todo"      :count later)
    ("gw" "⏳" "Waiting"   :count waiting)
    ("gs" "🗓" "Scheduled" :count scheduled)
    ("gd" "⚑"  "Deadline"  :count deadline)
    ("gm" "☁"  "Someday"   :count someday)
    ("gp" "◆"  "Proyectos" :count projects)
    ("gr" "📄" "Reference" :count reference)
    ("gl" "✔"  "Logbook"))
  "Secciones de la vista GTD (menú lateral y menú de la agenda), en su orden."
  :type '(repeat sexp) :group 'organice)

(defun organice-gtd--custom-sections ()
  "Secciones propias con su tecla de agenda (gc1, gc2…): lista de (TECLA NOMBRE PLIST)."
  (let ((n 0) out)
    (dolist (e organice-gtd-menu (nreverse out))
      (unless (car e)
        (setq n (1+ n))
        (push (list (format "gc%d" n) (nth 2 e) (nthcdr 3 e)) out)))))

(defun organice-gtd--custom-match-p (plist)
  "¿Cumple la tarea del punto las reglas PLIST de una sección propia?"
  (and (organice--kw) (not (organice--done-p)) (not (organice--project-p))
       (or (organice--matches-rules-p (plist-put (copy-sequence plist) :tags nil))
           (let ((tags (mapcar #'downcase (plist-get plist :tags))))
             (and tags (seq-some (lambda (tg) (member (downcase tg) tags)) (org-get-tags)))))))

(defun organice-gtd--menu-entries ()
  "Secciones visibles: lista de (TECLA ICONO NOMBRE CONTADOR)."
  (let ((customs (organice-gtd--custom-sections)) (i 0) out)
    (dolist (e organice-gtd-menu (nreverse out))
      (let* ((opts (nthcdr 3 e))
             (key (or (car e) (car (nth (prog1 i (setq i (1+ i))) customs)))))
        (unless (and (plist-member opts :show) (not (plist-get opts :show)))
          (push (list key (nth 1 e) (nth 2 e) (if (car e) (plist-get opts :count) (intern key)))
                out))))))

;; El menú de la agenda: sin las ocultas, con los nombres de aquí y con las secciones propias
(defun organice-gtd--adjust-commands (cmds)
  (let* ((hidden (delq nil (mapcar (lambda (e) (and (car e)
                                                      (plist-member (nthcdr 3 e) :show)
                                                      (not (plist-get (nthcdr 3 e) :show))
                                                      (car e)))
                                   organice-gtd-menu)))
         (names (delq nil (mapcar (lambda (e) (and (car e) (cons (car e) (nth 2 e))))
                                  organice-gtd-menu)))
         (cmds (seq-remove (lambda (c) (member (car c) hidden)) cmds))
         (cmds (mapcar (lambda (c)
                         (let ((nm (cdr (assoc (car c) names))))
                           (if (and nm (stringp (cadr c))) (append (list (car c) nm) (cddr c)) c)))
                       cmds)))
    (append cmds
            (mapcar (lambda (cs)
                      (pcase-let ((`(,key ,name ,plist) cs))
                        `(,key ,name
                               ((tags-todo "LEVEL>0"
                                           ((org-agenda-overriding-header ,name)
                                            (org-agenda-skip-function
                                             '(organice--skip-unless
                                               (lambda () (organice-gtd--custom-match-p ',plist))))))))))
                    (organice-gtd--custom-sections)))))
(advice-add 'organice--custom-commands :filter-return #'organice-gtd--adjust-commands)
(setq org-agenda-custom-commands (organice--custom-commands))

(defconst organice-sidebar-buffer "*ORGanice GTD*")

;;;; Contadores (una sola pasada por todos los ficheros) ----------------------------------------

(defvar organice-sidebar--counts nil "Alist (LISTA . Nº).")
(defvar organice-sidebar--projects nil "Lista de (TÍTULO . MARCADOR) de los proyectos activos.")

(defun organice-sidebar--compute ()
  "Cuenta las tareas de cada lista y recoge los proyectos activos."
  (let ((counts nil) (projects nil) (customs (organice-gtd--custom-sections)))
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
                      (when (organice-deadline-view-p) (bump 'deadline))
                      (dolist (cs customs)
                        (when (organice-gtd--custom-match-p (nth 2 cs)) (bump (intern (car cs)))))))
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
      (dolist (item (organice-gtd--menu-entries))
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
