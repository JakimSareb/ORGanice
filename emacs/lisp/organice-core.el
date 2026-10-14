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

;; (2.18) Como la app: contadores [n/m] contando solo las subtareas directas, y al terminar una
;; tarea que se repite sus casillas vuelven a [ ] (y sus contadores a cero)
(setq org-hierarchical-todo-statistics t
      org-checkbox-hierarchical-statistics t)
(defun organice-reset-checkboxes-on-repeat ()
  "Al repetirse una tarea, desmarcar sus casillas (como la app 2.18)."
  (org-reset-checkbox-state-subtree))
(add-hook 'org-todo-repeat-hook #'organice-reset-checkboxes-on-repeat)

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

;;;; 2.17: finales de línea, y de inbox.org a tasks.org al dar estado --------------------------

;; Sin ^M: los ficheros se guardan siempre con finales de línea Unix (LF), como la app desde 2.17
(defun organice--force-unix-eol ()
  (when (and buffer-file-name (derived-mode-p 'org-mode)
             (memq (coding-system-eol-type buffer-file-coding-system) '(1 2)))
    (set-buffer-file-coding-system 'unix)))
(add-hook 'before-save-hook #'organice--force-unix-eol)

(defcustom organice-refile-from-inbox t
  "t: al darle estado (TODO, NEXT…) a un encabezado de primer nivel de `organice-inbox-file',
pasa solo al final de `organice-tasks-file' (como en la app). Los encabezados sin estado se quedan."
  :type 'boolean)

(defun organice--refile-from-inbox-now (marker)
  "Pasa el subárbol de MARKER a `organice-tasks-file' (al final, nivel 1)."
  (when (and (markerp marker) (marker-buffer marker)
             (file-exists-p (organice-tasks-path)))
    (condition-case err
        (with-current-buffer (marker-buffer marker)
          (org-with-wide-buffer
           (goto-char marker)
           (org-back-to-heading t)
           (org-cut-subtree)
           (save-buffer))
          (with-current-buffer (find-file-noselect (organice-tasks-path))
            (org-with-wide-buffer
             (goto-char (point-max))
             (unless (bolp) (insert "\n"))
             (org-paste-subtree 1)
             (save-buffer))))
      (error (message "ORGanice: no se pudo pasar a %s: %s" organice-tasks-file
                      (error-message-string err))))
    (set-marker marker nil)))

(defun organice--refile-from-inbox ()
  "En `org-after-todo-state-change-hook': de inbox.org a tasks.org al darle estado."
  (when (and organice-refile-from-inbox
             (derived-mode-p 'org-mode)
             buffer-file-name
             (stringp org-state) (not (string-empty-p org-state))
             (string-empty-p (or (bound-and-true-p org-last-state) ""))
             (equal (file-truename buffer-file-name) (file-truename (organice-inbox-path)))
             (not (equal (file-truename (organice-inbox-path))
                         (file-truename (organice-tasks-path))))
             (= (org-outline-level) 1))
    ;; con un instante de margen: que Org termine de cambiar el estado antes de mover el árbol
    (run-with-timer 0.2 nil #'organice--refile-from-inbox-now (point-marker))))
(add-hook 'org-after-todo-state-change-hook #'organice--refile-from-inbox)

;;;; (3.05) Historial de estados en :LOGBOOK: («Ordenar historial» de la app) -------------------
;; La app (3.05) escribe siempre los cambios de estado dentro de :LOGBOOK: (como
;; `org-log-into-drawer' t, ya puesto arriba). `eli/estados-a-logbook' arregla los ficheros
;; antiguos: en el fichero actual, las líneas «- State …» sueltas de cada entrada pasan a su
;; cajón :LOGBOOK: (se crea si falta), con las notas de varias líneas («\\») y en orden (las
;; más nuevas arriba). Se deshace con C-/ como cualquier cambio.

(defun eli--state-line-time (line)
  "Momento (segundos) de la fecha [AAAA-MM-DD …] de LINE, o nil."
  (when (string-match
         "\\[\\([0-9]\\{4\\}\\)-\\([0-9]\\{2\\}\\)-\\([0-9]\\{2\\}\\)[^]0-9]*\\(?:\\([0-9]\\{1,2\\}\\):\\([0-9]\\{2\\}\\)\\)?[^]]*\\]"
         line)
    (float-time
     (encode-time 0
                  (if (match-string 5 line) (string-to-number (match-string 5 line)) 0)
                  (if (match-string 4 line) (string-to-number (match-string 4 line)) 0)
                  (string-to-number (match-string 3 line))
                  (string-to-number (match-string 2 line))
                  (string-to-number (match-string 1 line))))))

(defun eli--state-block-lines (text base)
  "Líneas de TEXT (una entrada «- State» y su nota) sin la sangría BASE de la primera."
  (let ((lines (split-string (string-trim-right text "\n") "\n")))
    (cons (string-trim (car lines))
          (mapcar (lambda (l)
                    (concat (make-string (max 2 (- (length (progn (string-match "\\`[ \t]*" l)
                                                                   (match-string 0 l)))
                                                     base))
                                         ?\s)
                            (string-trim l)))
                  (cdr lines)))))

(defun eli--take-loose-state-lines ()
  "Quita del cuerpo de la entrada actual las líneas «- State» sueltas (fuera de cajones).
Devuelve la lista de bloques (cada uno, lista de líneas) en su orden."
  (save-excursion
    (org-back-to-heading t)
    (let ((end (copy-marker (save-excursion (outline-next-heading) (point))))
          blocks)
      (forward-line 1)
      (while (< (point) end)
        (cond
         ((looking-at "^[ \t]*:\\([A-Za-z][A-Za-z0-9_-]*\\):[ \t]*$")
          (forward-line 1)
          (if (re-search-forward "^[ \t]*:END:[ \t]*$" end t)
              (forward-line 1)
            (goto-char end)))
         ((looking-at "^\\([ \t]*\\)- State[ \t]+\"")
          (let* ((base (length (match-string 1)))
                 (start (point))
                 (multi (string-match-p "\\\\\\\\[ \t]*$"
                                        (buffer-substring-no-properties
                                         (line-beginning-position) (line-end-position)))))
            (forward-line 1)
            (when multi
              (while (and (< (point) end)
                          (looking-at "^\\([ \t]*\\)[^ \t\n]")
                          (> (length (match-string 1)) base))
                (forward-line 1)))
            (push (eli--state-block-lines (buffer-substring-no-properties start (point)) base)
                  blocks)
            (delete-region start (point))))
         (t (forward-line 1))))
      (set-marker end nil)
      (nreverse blocks))))

(defun eli--put-state-blocks-in-logbook (blocks)
  "Mete BLOCKS en el cajón :LOGBOOK: de la entrada actual (lo crea si falta)."
  (save-excursion
    (org-back-to-heading t)
    (goto-char (let ((org-log-into-drawer t)) (org-log-beginning t)))
    (let* ((start (line-beginning-position))
           (ind (save-excursion
                  (forward-line -1)
                  (and (looking-at "^\\([ \t]*\\):LOGBOOK:") (match-string 1))))
           (end (save-excursion (re-search-forward "^[ \t]*:END:[ \t]*$") (line-beginning-position)))
           (old '()))
      ;; lo que ya hay en el cajón, en bloques (una línea de estado o CLOCK con sus notas)
      (dolist (l (split-string (buffer-substring-no-properties start end) "\n" t))
        (if (or (null old) (string-match-p "^[ \t]*\\(- State\\|CLOCK:\\)" l))
            (push (list (string-trim l)) old)
          (setcar old (append (car old) (list (concat "  " (string-trim l)))))))
      (setq old (nreverse old))
      (dolist (b blocks)
        (let* ((tb (eli--state-line-time (car b)))
               (pos (and tb (cl-position-if
                             (lambda (o)
                               (and (string-prefix-p "- State" (car o))
                                    (let ((to (eli--state-line-time (car o))))
                                      (and to (< to tb)))))
                             old))))
          (setq old (if pos
                        (append (cl-subseq old 0 pos) (list b) (nthcdr pos old))
                      (append old (list b))))))
      (delete-region start end)
      (goto-char start)
      (dolist (b old)
        (dolist (l b) (insert (or ind "") l "\n"))))))

(defun eli/estados-a-logbook ()
  "Pasa al cajón :LOGBOOK: las líneas «- State …» sueltas de cada entrada del fichero actual."
  (interactive)
  (unless (derived-mode-p 'org-mode) (user-error "Esto funciona en un fichero .org"))
  (let ((n 0) (entries 0))
    (org-with-wide-buffer
     (goto-char (point-min))
     (unless (org-at-heading-p) (outline-next-heading))
     (while (and (org-at-heading-p) (not (eobp)))
       (let ((blocks (eli--take-loose-state-lines)))
         (when blocks
           (setq n (+ n (length blocks)) entries (1+ entries))
           (eli--put-state-blocks-in-logbook blocks)))
       (unless (outline-next-heading) (goto-char (point-max)))))
    (message (if (> n 0)
                 (format "Historial ordenado: %d línea(s) en %d entrada(s)" n entries)
               "El historial ya está ordenado"))
    n))
(defalias 'organice-tidy-state-log #'eli/estados-a-logbook)

(provide 'organice-core)
;;; organice-core.el ends here
