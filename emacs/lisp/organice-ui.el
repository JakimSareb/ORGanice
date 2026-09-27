;;; organice-ui.el --- ORGanice: paleta de comandos, atajos y formato  -*- lexical-binding: t; -*-

;; - Paleta de comandos (⌘K / s-k, o C-c k): ficheros, encabezados, etiquetas y acciones,
;;   con búsqueda tolerante (cmppnt → «Comprar pintura») y prefijos > acciones, # etiquetas,
;;   / ficheros, * encabezados. Lo último usado sale primero.
;; - Documentos ⇄ GTD: F12 (o C-c g g).
;; - Vistas GTD: C-c g f Focus, i Inbox, n Next, t Todo, w Waiting, s Scheduled, d Deadline,
;;   m Someday, p Proyectos, r Reference, l Logbook, a Agenda.
;; - Formato como en la app: ⌘B negrita, ⌘I cursiva, ⌘U subrayado, ⌘⇧X tachado, ⌘E código,
;;   ⌘⇧E literal (en Linux/Windows, la tecla Super; y siempre también C-c e b/i/u/s/c/v).

(require 'org)
(require 'organice-core)
(require 'organice-gtd)

;;;; Completado: vertico + orderless (búsqueda tolerante) + marginalia + consult ---------------

(use-package vertico
  :init (vertico-mode 1)
  :custom (vertico-cycle t))

(use-package orderless
  :custom
  (completion-styles '(orderless basic))
  (completion-category-overrides '((file (styles basic partial-completion))))
  ;; Cada palabra: literal, o sus letras en orden (como la paleta de la app)
  (orderless-matching-styles '(orderless-literal orderless-flex)))

(use-package marginalia :init (marginalia-mode 1))

(use-package consult
  :bind (("C-x b" . consult-buffer)
         ("M-s l" . consult-line)
         ("M-s r" . consult-ripgrep)))

(use-package which-key
  :if (version< emacs-version "30")
  :init (which-key-mode 1))
(when (fboundp 'which-key-mode) (which-key-mode 1))

(use-package org-super-agenda
  :after org-agenda
  :config (org-super-agenda-mode 1))

;;;; Sincronizar (el botón ↻ de la app) -----------------------------------------------------

(defun organice-sync ()
  "Guarda los ficheros .org cambiados y relee los que han cambiado en Dropbox."
  (interactive)
  (org-save-all-org-buffers)
  (dolist (buf (buffer-list))
    (with-current-buffer buf
      (when (and (derived-mode-p 'org-mode) buffer-file-name
                 (not (buffer-modified-p)) (not (verify-visited-file-modtime buf)))
        (revert-buffer t t t))))
  (organice-refresh-agenda-files)
  (when (derived-mode-p 'org-agenda-mode) (org-agenda-redo t))
  (message "Sincronizado"))

;;;; Formato del texto ------------------------------------------------------------------------

(defun organice-emphasize (char)
  "Pone o quita el marcador CHAR en la selección; sin selección, inserta el par."
  (if (use-region-p)
      (org-emphasize char)
    (insert char char)
    (backward-char)))

(with-eval-after-load 'org
  (dolist (binding `(("s-b" . ?*) ("s-i" . ?/) ("s-u" . ?_) ("s-X" . ?+) ("s-e" . ?~) ("s-E" . ?=)
                     ("C-c e b" . ?*) ("C-c e i" . ?/) ("C-c e u" . ?_)
                     ("C-c e s" . ?+) ("C-c e c" . ?~) ("C-c e v" . ?=)))
    (define-key org-mode-map (kbd (car binding))
                (let ((ch (cdr binding))) (lambda () (interactive) (organice-emphasize ch))))))

;;;; Paleta de comandos ------------------------------------------------------------------------

(defvar organice-palette-history nil)

(defun organice--palette-actions ()
  `(("Nueva tarea en Inbox" . ,(lambda () (org-capture nil "i")))
    ("Capturar con plantilla…" . org-capture)
    ("Abrir la agenda" . organice-gtd-agenda)
    ("Cambiar Documentos ⇄ GTD" . organice-toggle-mode)
    ("GTD: Focus" . organice-gtd-focus)
    ("GTD: Inbox" . organice-gtd-inbox)
    ("GTD: Next" . organice-gtd-next)
    ("GTD: Todo" . organice-gtd-todo)
    ("GTD: Waiting" . organice-gtd-waiting)
    ("GTD: Scheduled" . organice-gtd-scheduled)
    ("GTD: Deadline" . organice-gtd-deadline)
    ("GTD: Someday" . organice-gtd-someday)
    ("GTD: Reference" . organice-gtd-reference)
    ("GTD: Logbook" . organice-gtd-logbook)
    ("Todos los proyectos" . organice-gtd-projects)
    ("Sincronizar" . organice-sync)
    ("Archivar las terminadas de este fichero" . organice-archive-done)
    ("Buscar en todos los ficheros" . ,(lambda () (org-search-view)))
    ("Mover (refile)…" . org-refile)
    ("Ficheros de la carpeta" . ,(lambda () (dired organice-directory)))
    ("Dos columnas" . split-window-right)
    ("Una columna" . delete-other-windows)
    ("Ver todo (widen)" . widen)
    ("Tema…" . organice-theme)
    ("Ajustes de ORGanice" . ,(lambda () (customize-group 'organice)))
    ("Manual (README)" . ,(lambda () (find-file (locate-user-emacs-file "README.org"))))))

(defun organice--palette-candidates ()
  "Candidatos de la paleta: (texto . acción)."
  (let (cands)
    (dolist (a (organice--palette-actions))
      (push (cons (concat "> " (car a)) (cdr a)) cands))
    (dolist (f (organice-org-files))
      (let ((rel (file-relative-name f organice-directory)))
        (push (cons (concat "/ " rel) (lambda () (find-file f))) cands)))
    (dolist (tag (delete-dups (mapcar (lambda (x) (if (consp x) (car x) x))
                                      (ignore-errors (org-global-tags-completion-table)))))
      (when (stringp tag)
        (push (cons (concat "# " tag) (lambda () (org-tags-view nil tag))) cands)))
    (org-map-entries
     (lambda ()
       (let* ((kw (org-get-todo-state))
              (title (org-get-heading t t t t))
              (file (file-relative-name (buffer-file-name (buffer-base-buffer)) organice-directory))
              (marker (point-marker)))
         (push (cons (format "* %s%s   · %s" (if kw (concat kw " ") "") title file)
                     (lambda () (organice--goto-heading marker)))
               cands)))
     nil 'agenda)
    (nreverse cands)))

(defun organice--goto-heading (marker)
  "Abre el encabezado de MARKER reducido a él (narrow), como la paleta de la app."
  (switch-to-buffer (marker-buffer marker))
  (widen)
  (goto-char marker)
  (org-fold-show-context)
  (org-narrow-to-subtree)
  (org-fold-show-subtree))

(defun organice-palette ()
  "Paleta de comandos de ORGanice (como Ctrl+K en la app)."
  (interactive)
  (let* ((cands (organice--palette-candidates))
         (choice (completing-read "Paleta (> acciones · / ficheros · # etiquetas · * tareas): "
                                  cands nil t nil 'organice-palette-history))
         (action (cdr (assoc choice cands))))
    (when action (if (commandp action) (call-interactively action) (funcall action)))))

;;;; Atajos globales ---------------------------------------------------------------------------

(defvar organice-gtd-map
  (let ((m (make-sparse-keymap)))
    (define-key m "g" #'organice-toggle-mode)
    (define-key m "f" #'organice-gtd-focus)
    (define-key m "i" #'organice-gtd-inbox)
    (define-key m "n" #'organice-gtd-next)
    (define-key m "t" #'organice-gtd-todo)
    (define-key m "w" #'organice-gtd-waiting)
    (define-key m "s" #'organice-gtd-scheduled)
    (define-key m "d" #'organice-gtd-deadline)
    (define-key m "m" #'organice-gtd-someday)
    (define-key m "p" #'organice-gtd-projects)
    (define-key m "P" #'organice-project-view)
    (define-key m "r" #'organice-gtd-reference)
    (define-key m "l" #'organice-gtd-logbook)
    (define-key m "a" #'organice-gtd-agenda)
    (define-key m "*" #'organice-toggle-star)
    (define-key m "z" #'organice-set-sleep)
    (define-key m "x" #'organice-close-project)
    (define-key m "A" #'organice-archive-done)
    m)
  "Atajos de la vista GTD (C-c g …).")

(global-set-key (kbd "C-c g") organice-gtd-map)
(global-set-key (kbd "<f12>") #'organice-toggle-mode)
(global-set-key (kbd "C-c k") #'organice-palette)
(global-set-key (kbd "s-k") #'organice-palette)
(global-set-key (kbd "C-c c") #'org-capture)
(global-set-key (kbd "C-c a") #'org-agenda)
(global-set-key (kbd "C-c l") #'org-store-link)
(global-set-key (kbd "C-c s") #'organice-sync)
(global-set-key (kbd "<f5>") #'organice-sync)

;; En la agenda: g vuelve a calcular (como siempre); F12 vuelve al documento.
(with-eval-after-load 'org-agenda
  (define-key org-agenda-mode-map (kbd "<f12>") #'organice-toggle-mode))

;; Al arrancar: la vista Focus, como la app al abrir la vista GTD (comenta la línea si no lo quieres)
(add-hook 'emacs-startup-hook (lambda () (when (file-directory-p organice-directory)
                                           (organice-gtd-focus))))

(provide 'organice-ui)
;;; organice-ui.el ends here
