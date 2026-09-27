;;; organice-core.el --- ORGanice: Org Mode como en la app  -*- lexical-binding: t; -*-

;; Carpeta de ficheros, estados, etiquetas, propiedades, registro, archivo, refile y cifrado,
;; con los mismos valores por defecto que ORGanice.

(require 'org)
(require 'org-habit)
(require 'org-archive)
(require 'org-crypt)
(require 'epa-file)
(require 'seq)
(require 'subr-x)

(defgroup organice nil "Réplica de ORGanice en Emacs." :group 'org)

;;;; Carpeta de los ficheros ------------------------------------------------------------------

(defun organice--guess-directory ()
  "Busca la carpeta de ORGanice en Dropbox."
  (seq-find #'file-directory-p
            (mapcar #'expand-file-name
                    '("~/Dropbox/Aplicaciones/ORGanice/"
                      "~/Dropbox/Apps/ORGanice/"
                      "~/Library/CloudStorage/Dropbox/Aplicaciones/ORGanice/"
                      "~/Library/CloudStorage/Dropbox/Apps/ORGanice/"
                      "~/Dropbox/org/"
                      "~/Dropbox/"
                      "~/org/"))))

(defcustom organice-directory
  (file-name-as-directory
   (or (bound-and-true-p organice-directory-override) (organice--guess-directory) "~/org/"))
  "Carpeta de los ficheros .org (la misma que usa la app en Dropbox)."
  :type 'directory)

(defcustom organice-inbox-file "inbox.org"
  "Fichero de entrada (Inbox). Sus encabezados sin estado se ven en Inbox."
  :type 'string)

(defcustom organice-tasks-file "tasks.org"
  "Fichero donde van las tareas nuevas."
  :type 'string)

(defcustom organice-all-org-files t
  "Como «Todos los ficheros .org, automáticamente» de la app.
t: todos los .org de la carpeta y subcarpetas entran en la agenda, la búsqueda y el refile.
nil: solo los de `organice-agenda-files'."
  :type 'boolean)

(defcustom organice-agenda-files '("inbox.org" "tasks.org")
  "Ficheros de la agenda si `organice-all-org-files' es nil (relativos a la carpeta)."
  :type '(repeat string))

(defcustom organice-excluded-directories '("backups" "archive" ".git")
  "Subcarpetas que nunca entran en la agenda (copias de seguridad y archivo)."
  :type '(repeat string))

(setq org-directory organice-directory
      org-default-notes-file (expand-file-name organice-inbox-file organice-directory))

(defun organice-inbox-path () (expand-file-name organice-inbox-file organice-directory))
(defun organice-tasks-path () (expand-file-name organice-tasks-file organice-directory))

(defun organice-org-files ()
  "Ficheros .org de la carpeta (y subcarpetas), sin copias de seguridad ni archivo."
  (if (not (file-directory-p organice-directory))
      nil
    (let ((excluded (mapconcat #'regexp-quote organice-excluded-directories "\\|")))
      (seq-remove
       (lambda (f)
         (or (string-match-p (concat "/\\(?:" excluded "\\)/") (file-relative-name f organice-directory))
             (string-match-p (concat "\\`\\(?:" excluded "\\)/") (file-relative-name f organice-directory))
             (string-match-p "/\\.#" f)))
       (directory-files-recursively organice-directory "\\.org\\(?:\\.gpg\\|\\.asc\\)?\\'")))))

(defun organice-refresh-agenda-files ()
  "Vuelve a calcular la lista de ficheros (también los .org nuevos, como la app)."
  (interactive)
  (setq org-agenda-files
        (if organice-all-org-files
            (organice-org-files)
          (seq-filter #'file-exists-p
                      (mapcar (lambda (f) (expand-file-name f organice-directory))
                              organice-agenda-files)))))
(organice-refresh-agenda-files)

;;;; Estados, prioridades y etiquetas (Ajustes → Tareas y etiquetas) ---------------------------

(setq org-todo-keywords
      '((sequence "NEXT(n)" "TODO(t)" "MAYBE(m)" "WAITING(w)" "PROJECT(p)" "|" "DONE(d)" "CANCELLED(c)"))
      org-use-fast-todo-selection 'expert
      org-priority-highest ?A
      org-priority-lowest ?C
      org-priority-default ?B)

;; Etiquetas por defecto (contextos), como «#+TAGS:» de la app
(setq org-tag-alist
      '(("@ordenador" . ?o) ("@casa" . ?h) ("@llamadas" . ?l) ("@inbox" . ?i)
        ("@videos" . ?v) ("@leer" . ?r) ("@recados" . ?e) ("@anywhere" . ?a)
        ("sleep" . ?z) ("crypt" . ?c))
      org-fast-tag-selection-single-key nil
      org-tags-column -80)

;; Energía y tiempo (propiedades Energy y Effort), como «#+PROPERTY: …_ALL» de la app
(setq org-global-properties
      '(("Energy_ALL" . "Low Medium High QuickWin")
        ("Effort_ALL" . "0:10 0:30 1:00 2:00 3:00 4:00"))
      org-columns-default-format "%40ITEM %10Effort %10Energy %CLOCKSUM")

;; El ÁREA se hereda de los encabezados de arriba (como en la vista GTD)
(setq org-use-property-inheritance '("AREA"))

;;;; Escritura, como la app (y como Emacs con org-adapt-indentation nil) ----------------------

(setq org-adapt-indentation nil
      org-startup-folded 'content
      org-hide-emphasis-markers nil
      org-pretty-entities nil
      org-ellipsis " ▾"
      org-log-done 'time          ; CLOSED: [fecha] al terminar
      org-log-repeat 'time
      org-log-into-drawer t       ; notas y cambios en :LOGBOOK:
      org-closed-keep-when-no-todo t
      org-deadline-warning-days 5 ; la agenda avisa 5 días antes (como la app)
      org-return-follows-link t
      org-link-file-path-type 'relative
      org-id-link-to-org-use-id 'create-if-interactive-and-no-custom-id
      org-startup-with-inline-images t
      org-image-actual-width '(600))

;; Hábitos (:STYLE: habit), con el mismo gráfico que la agenda de la app
(setq org-habit-graph-column 50
      org-habit-preceding-days 21
      org-habit-following-days 7
      org-habit-show-all-today nil)
(add-to-list 'org-modules 'org-habit)

;;;; Refile (Mover a…) ------------------------------------------------------------------------

(setq org-refile-targets '((nil :maxlevel . 3) (org-agenda-files :maxlevel . 3))
      org-refile-use-outline-path 'file
      org-outline-path-complete-in-steps nil
      org-refile-allow-creating-parent-nodes 'confirm)

;;;; Archivo (como la app: Ajustes → Tareas y etiquetas → «Archivar en») ----------------------

(defcustom organice-archive-in-subfolder nil
  "nil: archivar junto al fichero (tareas.org → tareas.org_archive).
t: en la subcarpeta archive de cada carpeta (proyectos/archive/tareas.org_archive).
Una línea #+ARCHIVE: del fichero, o la propiedad ARCHIVE, siguen mandando."
  :type 'boolean
  :set (lambda (sym val)
         (set-default sym val)
         (setq org-archive-location (if val "archive/%s_archive::" "%s_archive::"))))
(setq org-archive-location (if organice-archive-in-subfolder "archive/%s_archive::" "%s_archive::"))

;; Crear la carpeta de destino si no existe (p. ej. archive/) al guardar
(defun organice--ensure-directory ()
  (when buffer-file-name
    (let ((dir (file-name-directory buffer-file-name)))
      (unless (file-directory-p dir) (make-directory dir t)))))
(add-hook 'before-save-hook #'organice--ensure-directory)

;; …y antes de archivar (Emacs no deja escribir en una carpeta que no existe)
(defun organice--prepare-archive-dir (&rest _)
  (when (and (derived-mode-p 'org-mode) (fboundp 'org-archive--compute-location))
    (let* ((loc (org-archive--compute-location
                 (or (org-entry-get nil "ARCHIVE" 'inherit) org-archive-location)))
           (file (car loc)))
      (when (and file (not (string-empty-p file)))
        (let ((dir (file-name-directory (expand-file-name file))))
          (unless (file-directory-p dir) (make-directory dir t)))))))
(advice-add 'org-archive-subtree :before #'organice--prepare-archive-dir)

(setq org-archive-save-context-info '(time file olpath category todo itags)
      org-archive-subtree-save-file-p t)

;;;; Cifrado (compatible con la app: ficheros .org.gpg/.org.asc y encabezados :crypt:) ----------

(epa-file-enable)
(setq epa-file-select-keys nil          ; simétrico (frase de paso) salvo que el fichero diga otra cosa
      epg-pinentry-mode 'loopback)
(org-crypt-use-before-save-magic)
(setq org-tags-exclude-from-inheritance '("crypt" "sleep")
      org-crypt-key nil                  ; nil = frase de paso (como la app por defecto)
      org-crypt-disable-auto-save 'encrypt)

;;;; Varios -----------------------------------------------------------------------------------

;; Abrir ficheros .org con líneas largas cortadas en pantalla y sangría visual opcional
(add-hook 'org-mode-hook #'visual-line-mode)

(provide 'organice-core)
;;; organice-core.el ends here
