;;; organice-attach.el --- ORGanice: adjuntos como en la app  -*- lexical-binding: t; -*-

;; Lo mismo que ORGanice 2.10–2.11 hace con los archivos adjuntos:
;; - Adjuntar un archivo a una tarea: se copia a assets/AAAA/ junto al fichero .org y se añade
;;   [[file:assets/AAAA/nombre]] al cuerpo de la tarea (C-c g j; también desde la agenda).
;; - Abrir un adjunto de la tarea (C-c g o) y borrarlo (C-c g D): pide confirmación, lo manda a
;;   la papelera y quita su enlace del texto.
;; - Clip 📎 junto al título de los encabezados con adjuntos (en los ficheros y en la agenda).
;; - Revisar adjuntos de tareas terminadas (C-c g R): lista las tareas terminadas, canceladas o
;;   archivadas (también en los ficheros _archive) con adjuntos, para abrirlos o borrarlos uno a
;;   uno o todos (se conservan los que siguen enlazados en tareas abiertas o notas).
;;
;; Son enlaces file: normales de Org (no org-attach), igual que los escribe la app.

(require 'org)
(require 'org-agenda)
(require 'seq)
(require 'cl-lib)
(require 'subr-x)
(require 'tabulated-list)
(require 'organice-core)

(defcustom organice-attach-directory "assets"
  "Carpeta de los adjuntos, junto al fichero .org (se guardan en <carpeta>/<año>/)."
  :type 'string :group 'organice)

(defcustom organice-attach-indicator t
  "Mostrar un clip 📎 junto al título de los encabezados que tienen archivos adjuntos."
  :type 'boolean :group 'organice)

(defcustom organice-attach-use-trash t
  "Al borrar un adjunto, mandarlo a la papelera (se puede recuperar) en vez de borrarlo del todo."
  :type 'boolean :group 'organice)

(defface organice-attach-face '((t :inherit link :underline nil :height 0.9))
  "Cara del clip de adjuntos." :group 'organice)

;;;; Enlaces a archivos (las mismas reglas que la app) ------------------------------------------

(defconst organice--bracket-link-re "\\[\\[\\([^]]+\\)\\]\\(?:\\[[^]]*\\]\\)?\\]")
(defconst organice--bare-file-re "\\(?:^\\|[ \t(]\\)\\(file:[^] \t\n)]+\\)")

(defun organice--file-link-target (uri)
  "Ruta del archivo (no .org) al que apunta URI, o nil. Como fileLinkTarget de la app."
  (when uri
    (let ((target (string-trim uri)))
      (cond
       ((string-match-p "\\`file:" target) (setq target (substring target 5)))
       ((string-match-p "\\`[a-zA-Z][a-zA-Z0-9+.-]*:" target) (setq target nil))
       ((not (or (string-match-p "\\`\\(?:\\.\\.?/\\|/\\)" target)
                 (string-match-p "\\`assets/" target)))
        (setq target nil)))
      (when target
        (setq target (replace-regexp-in-string "::.*\\'" "" target))
        (unless (or (string-prefix-p "~" target)
                    (string-match-p "\\.org\\(?:_archive\\)?\\(?:\\.gpg\\|\\.asc\\)?\\'" target)
                    (not (string-match-p "[^/]+\\.[A-Za-z0-9]\\{1,6\\}\\'" target)))
          target)))))

(defun organice--file-targets-in-text (text)
  "Destinos de los enlaces a archivos de TEXT, sin repetir y en orden."
  (let (out)
    (when text
      (with-temp-buffer
        (insert text)
        (goto-char (point-min))
        (while (re-search-forward organice--bracket-link-re nil t)
          (let ((tg (organice--file-link-target (match-string 1))))
            (when (and tg (not (member tg out))) (push tg out)))
          (replace-match " " t t))
        (goto-char (point-min))
        (while (re-search-forward organice--bare-file-re nil t)
          (let ((tg (organice--file-link-target (match-string 1))))
            (when (and tg (not (member tg out))) (push tg out))))))
    (nreverse out)))

(defun organice--resolve-attachment (org-file target)
  "Ruta completa de TARGET, relativa al fichero ORG-FILE (/… = raíz de la carpeta)."
  (if (string-prefix-p "/" target)
      (expand-file-name (substring target 1) organice-directory)
    (expand-file-name target (file-name-directory org-file))))

(defun organice--entry-bounds ()
  "(inicio-del-título . fin-del-cuerpo) del encabezado en el que está el cursor."
  (save-excursion
    (org-back-to-heading t)
    (cons (point) (org-entry-end-position))))

(defun organice--entry-text ()
  (let ((b (organice--entry-bounds)))
    (buffer-substring-no-properties (car b) (cdr b))))

(defun organice-entry-attachments ()
  "Adjuntos del encabezado actual: lista de (DESTINO . RUTA)."
  (let ((file (buffer-file-name (buffer-base-buffer))))
    (when file
      (delete-dups
       (mapcar (lambda (tg) (cons tg (organice--resolve-attachment file tg)))
               (organice--file-targets-in-text (organice--entry-text)))))))

(defun organice--remove-links-in-entry (target)
  "Quita del CUERPO del encabezado actual los enlaces a TARGET (el título no se toca).
Las líneas que se quedan vacías por ello desaparecen. Devuelve t si cambió algo."
  (let* ((b (organice--entry-bounds))
         (tq (regexp-quote target))
         (bracket (concat "\\[\\[\\(?:file:\\)?" tq "\\(?:::[^]]*\\)?\\]\\(?:\\[[^]]*\\]\\)?\\]"))
         (bare (concat "\\(^\\|[ \t(]\\)file:" tq "\\(?:$\\|[] \t)]\\)"))
         (end (copy-marker (cdr b)))
         changed)
    (save-excursion
      (goto-char (car b))
      (forward-line 1)
      (while (< (point) end)
        (let* ((lb (line-beginning-position))
               (le (line-end-position))
               (line (buffer-substring-no-properties lb le))
               (new (replace-regexp-in-string bracket "" line t t)))
          (setq new (replace-regexp-in-string
                     bare (lambda (m) (save-match-data
                                        (if (string-match "\\`[ \t(]" m) (substring m 0 1) "")))
                     new t t))
          (if (string= new line)
              (forward-line 1)
            (setq changed t)
            (if (string-empty-p (string-trim new))
                (delete-region lb (min (point-max) (1+ le)))
              (delete-region lb le)
              (goto-char lb)
              (insert (string-trim-right new))
              (forward-line 1))))))
    (set-marker end nil)
    changed))

;;;; Trabajar desde el fichero o desde la agenda --------------------------------------------------

(defmacro organice--at-entry (&rest body)
  "Ejecuta BODY en el encabezado del cursor, también si el cursor está en la agenda."
  `(if (derived-mode-p 'org-agenda-mode)
       (let ((marker (or (org-get-at-bol 'org-hd-marker) (org-get-at-bol 'org-marker))))
         (unless marker (user-error "Aquí no hay ninguna tarea"))
         (org-with-point-at marker ,@body))
     (unless (derived-mode-p 'org-mode) (user-error "Esto funciona en un fichero .org o en la agenda"))
     (when (org-before-first-heading-p) (user-error "El cursor no está en ningún encabezado"))
     ,@body))

(defun organice--sanitize-name (name)
  (replace-regexp-in-string "[][]" "_" (if (string-empty-p name) "archivo" name)))

(defun organice--unique-path (path)
  (if (not (file-exists-p path)) path
    (let ((base (file-name-sans-extension path)) (ext (file-name-extension path t)) (i 1))
      (while (file-exists-p (format "%s-%d%s" base i ext)) (setq i (1+ i)))
      (format "%s-%d%s" base i ext))))

(defun organice-attach-file (file)
  "Adjunta FILE a la tarea: lo copia a assets/AAAA/ junto al fichero y añade su enlace."
  (interactive "fAdjuntar archivo: ")
  (organice--at-entry
   (let* ((org-file (or (buffer-file-name (buffer-base-buffer))
                        (user-error "Guarda antes el fichero")))
          (dir (expand-file-name (format "%s/%s/" organice-attach-directory
                                         (format-time-string "%Y"))
                                 (file-name-directory org-file)))
          (dest (organice--unique-path
                 (expand-file-name (organice--sanitize-name (file-name-nondirectory file)) dir)))
          (rel (file-relative-name dest (file-name-directory org-file))))
     (make-directory dir t)
     (copy-file file dest)
     (save-excursion
       (goto-char (cdr (organice--entry-bounds)))
       (skip-chars-backward " \t\n")
       (end-of-line)
       (insert "\n[[file:" rel "]]"))
     (when (and (display-graphic-p) (fboundp 'org-display-inline-images))
       (ignore-errors (org-display-inline-images nil t)))
     (organice-attach-refresh-indicators)
     (message "Adjuntado: %s" rel))))

(defun organice--choose-attachment (prompt)
  (let ((atts (organice-entry-attachments)))
    (unless atts (user-error "Esta tarea no tiene archivos adjuntos"))
    (if (= (length atts) 1) (car atts)
      (let* ((names (mapcar (lambda (a) (cons (format "%s  (%s)" (file-name-nondirectory (cdr a))
                                                      (car a))
                                              a))
                            atts))
             (choice (completing-read prompt names nil t)))
        (cdr (assoc choice names))))))

(defun organice-open-attachment ()
  "Abre un archivo adjunto de la tarea (si hay varios, pregunta cuál)."
  (interactive)
  (let ((att (organice--at-entry (organice--choose-attachment "Abrir adjunto: "))))
    (if (file-exists-p (cdr att))
        (org-open-file (cdr att))
      (user-error "No existe: %s" (cdr att)))))

(defun organice--delete-file (path)
  (let ((delete-by-moving-to-trash organice-attach-use-trash))
    (delete-file path organice-attach-use-trash)))

(defun organice--trash-note ()
  (if organice-attach-use-trash
      "Irá a la papelera."
    "Se borrará definitivamente."))

(defun organice--references (path &optional exclude-marker)
  "Ficheros de la agenda (sin contar el encabezado EXCLUDE-MARKER) que enlazan PATH."
  (let (where)
    (dolist (f (organice-org-files))
      (with-current-buffer (find-file-noselect f)
        (org-with-wide-buffer
         (org-map-entries
          (lambda ()
            (unless (and exclude-marker (eq (marker-buffer exclude-marker) (current-buffer))
                         (= (point) (save-excursion (goto-char exclude-marker)
                                                    (org-back-to-heading t) (point))))
              (when (member path (mapcar #'cdr (organice-entry-attachments)))
                (cl-pushnew (file-relative-name f organice-directory) where :test #'equal))))
          nil 'file))))
    where))

(defun organice-delete-attachment ()
  "Borra un archivo adjunto de la tarea (con confirmación) y quita su enlace del texto."
  (interactive)
  (organice--at-entry
   (let* ((att (organice--choose-attachment "Borrar adjunto: "))
          (path (cdr att))
          (here (point-marker)))
     (if (not (file-exists-p path))
         (when (yes-or-no-p (format "%s ya no existe. ¿Quitar el enlace? " path))
           (organice--remove-links-in-entry (car att)))
       (let ((others (organice--references path here)))
         (when (yes-or-no-p
                (format "¿Borrar %s? %s%s También se quita su enlace. "
                        (file-relative-name path organice-directory)
                        (if others (format "⚠ También está enlazado en: %s. "
                                           (string-join others ", "))
                          "")
                        (organice--trash-note)))
           (organice--delete-file path)
           (organice--remove-links-in-entry (car att))
           (message "Borrado: %s" (file-name-nondirectory path)))))
     (set-marker here nil)
     (organice-attach-refresh-indicators))))

;;;; Clip 📎 en los títulos ------------------------------------------------------------------

(defun organice--clip (n)
  (propertize (if (> n 1) (format " 📎%d" n) " 📎") 'face 'organice-attach-face))

(defun organice-attach-refresh-indicators ()
  "Vuelve a poner el clip en los encabezados con adjuntos del fichero actual."
  (interactive)
  (when (derived-mode-p 'org-mode)
    (remove-overlays (point-min) (point-max) 'organice-attach t)
    (when organice-attach-indicator
      (org-with-wide-buffer
       (goto-char (point-min))
       (while (re-search-forward org-outline-regexp-bol nil t)
         (let* ((n (length (organice--file-targets-in-text (organice--entry-text))))
                (eol (line-end-position)))
           (when (and (> n 0) (> eol (line-beginning-position)))
             ;; El clip va en el último carácter del título (que siempre se ve, también plegado)
             (let ((ov (make-overlay (1- eol) eol nil t nil)))
               (overlay-put ov 'organice-attach t)
               (overlay-put ov 'evaporate t)
               (overlay-put ov 'display (concat (buffer-substring (1- eol) eol) (organice--clip n)))
               (overlay-put ov 'help-echo (format "%d archivo(s) adjunto(s)" n))))
           (end-of-line)))))))

(defvar-local organice--attach-dirty nil)
(defun organice--attach-mark-dirty (&rest _) (setq organice--attach-dirty t))
(defun organice--attach-idle-refresh ()
  (when (and organice--attach-dirty (derived-mode-p 'org-mode))
    (setq organice--attach-dirty nil)
    (organice-attach-refresh-indicators)))
(defvar organice--attach-timer nil)

(defun organice--attach-setup ()
  (organice-attach-refresh-indicators)
  (add-hook 'after-change-functions #'organice--attach-mark-dirty nil t)
  (unless organice--attach-timer
    (setq organice--attach-timer (run-with-idle-timer 1 t #'organice--attach-idle-refresh))))
(add-hook 'org-mode-hook #'organice--attach-setup)

;; En la agenda, el clip al final de la línea
(defun organice--agenda-clips ()
  (when organice-attach-indicator
    (let ((inhibit-read-only t))
      (save-excursion
        (goto-char (point-min))
        (while (not (eobp))
          (let ((m (org-get-at-bol 'org-hd-marker)))
            (when (and m (marker-buffer m))
              (let ((n (org-with-point-at m
                         (length (organice--file-targets-in-text (organice--entry-text))))))
                (when (> n 0)
                  (end-of-line)
                  (insert (organice--clip n))))))
          (forward-line 1))))))
(add-hook 'org-agenda-finalize-hook #'organice--agenda-clips)

;;;; Revisar adjuntos de tareas terminadas -----------------------------------------------------

(defun organice--archive-files ()
  "Ficheros *.org_archive de la carpeta (sin backups/)."
  (when (file-directory-p organice-directory)
    (seq-remove (lambda (f) (string-match-p "/backups/" (file-relative-name f organice-directory)))
                (directory-files-recursively organice-directory "\\.org_archive\\'"))))

(defun organice--scan-attachments ()
  "Devuelve (CANDIDATOS . REFERENCIAS).
CANDIDATOS: plists de adjuntos de tareas terminadas, canceladas o archivadas.
REFERENCIAS: tabla ruta → lista de marcadores de encabezados que la enlazan."
  (let ((refs (make-hash-table :test #'equal))
        cands)
    (dolist (f (append (organice-org-files) (organice--archive-files)))
      (let ((archived (string-match-p "\\.org_archive\\'" f)))
        (with-current-buffer (find-file-noselect f)
          (unless (derived-mode-p 'org-mode) (org-mode))
          (org-with-wide-buffer
           (org-map-entries
            (lambda ()
              (let ((atts (organice-entry-attachments)))
                (when atts
                  (let* ((m (point-marker))
                         (kw (org-get-todo-state))
                         (finished (or archived (member kw org-done-keywords))))
                    (dolist (a atts)
                      (push m (gethash (cdr a) refs))
                      (when finished
                        (push (list :marker m :file f
                                    :kind (cond (archived "Archivada")
                                                ((member kw '("CANCELLED" "CANCELED")) "Cancelada")
                                                (t "Terminada"))
                                    :title (org-get-heading t t t t)
                                    :target (car a) :path (cdr a)
                                    :exists (file-exists-p (cdr a)))
                              cands)))))))
            nil 'file)))))
    (cons (nreverse cands) refs)))

(defvar-local organice--review-cands nil)
(defvar-local organice--review-refs nil)

(defvar organice-review-mode-map
  (let ((m (make-sparse-keymap)))
    (define-key m (kbd "RET") #'organice-review-open)
    (define-key m "o" #'organice-review-open)
    (define-key m "t" #'organice-review-goto-task)
    (define-key m "d" #'organice-review-delete)
    (define-key m "D" #'organice-review-delete-all)
    (define-key m "g" #'organice-review-refresh)
    m))

(define-derived-mode organice-review-mode tabulated-list-mode "Adjuntos"
  "Adjuntos de tareas terminadas, canceladas o archivadas.
RET/o abrir · t ir a la tarea · d borrar · D borrar todos · g actualizar · q salir."
  (setq tabulated-list-format [("Estado" 10 t) ("Tarea" 38 t) ("Adjunto" 32 t) ("Fichero" 0 t)])
  (setq tabulated-list-padding 1)
  (tabulated-list-init-header))

(defun organice-review-refresh ()
  "Vuelve a buscar."
  (interactive)
  (let ((scan (organice--scan-attachments)))
    (setq organice--review-cands (car scan)
          organice--review-refs (cdr scan))
    (setq tabulated-list-entries
          (mapcar (lambda (c)
                    (list c (vector (plist-get c :kind)
                                    (plist-get c :title)
                                    (concat (file-name-nondirectory (plist-get c :path))
                                            (if (plist-get c :exists) "" " (ya no existe)"))
                                    (file-relative-name (plist-get c :file) organice-directory))))
                  organice--review-cands))
    (tabulated-list-print t)
    (message "%d adjunto(s) en tareas terminadas o archivadas. RET abrir · d borrar · D borrar todos · q salir"
             (length organice--review-cands))))

(defun organice-review-finished-attachments ()
  "Lista los adjuntos de las tareas terminadas, canceladas o archivadas (como la app)."
  (interactive)
  (let ((buf (get-buffer-create "*ORGanice: adjuntos de terminadas*")))
    (with-current-buffer buf
      (organice-review-mode)
      (organice-review-refresh))
    (pop-to-buffer buf)))

(defun organice--review-current ()
  (or (tabulated-list-get-id) (user-error "No hay nada en esta línea")))

(defun organice-review-open ()
  "Abre el archivo adjunto de la línea."
  (interactive)
  (let ((c (organice--review-current)))
    (if (plist-get c :exists) (org-open-file (plist-get c :path))
      (user-error "Ya no existe: %s" (plist-get c :path)))))

(defun organice-review-goto-task ()
  "Va a la tarea de la línea."
  (interactive)
  (let ((m (plist-get (organice--review-current) :marker)))
    (pop-to-buffer (marker-buffer m))
    (widen)
    (goto-char m)
    (org-fold-show-context)))

(defun organice--review-remove-link (c)
  (let ((m (plist-get c :marker)))
    (with-current-buffer (marker-buffer m)
      (org-with-wide-buffer
       (goto-char m)
       (when (organice--remove-links-in-entry (plist-get c :target))
         (save-buffer))))))

(defun organice-review-delete ()
  "Borra el adjunto de la línea (con confirmación) y quita su enlace."
  (interactive)
  (let* ((c (organice--review-current))
         (path (plist-get c :path))
         (others (seq-remove (lambda (m) (eq m (plist-get c :marker)))
                             (gethash path organice--review-refs))))
    (when (if (plist-get c :exists)
              (yes-or-no-p (format "¿Borrar %s? %s%s También se quita su enlace. "
                                   (file-name-nondirectory path)
                                   (if others (format "⚠ Enlazado también en %d sitio(s) más. "
                                                      (length others))
                                     "")
                                   (organice--trash-note)))
            (yes-or-no-p (format "%s ya no existe. ¿Quitar el enlace? "
                                 (file-name-nondirectory path))))
      (when (plist-get c :exists) (organice--delete-file path))
      (organice--review-remove-link c)
      (organice-review-refresh))))

(defun organice-review-delete-all ()
  "Borra todos los adjuntos de la lista, salvo los que siguen enlazados en tareas abiertas o notas."
  (interactive)
  (let* ((cands organice--review-cands)
         (cand-markers (delete-dups (mapcar (lambda (c) (plist-get c :marker)) cands)))
         kept to-delete)
    (unless cands (user-error "No hay adjuntos que revisar"))
    (dolist (c cands)
      (if (seq-some (lambda (m) (not (memq m cand-markers)))
                    (gethash (plist-get c :path) organice--review-refs))
          (cl-pushnew (plist-get c :path) kept :test #'equal)
        (push c to-delete)))
    (setq to-delete (nreverse to-delete))
    (if (null to-delete)
        (message "Todos siguen enlazados en tareas abiertas o notas: no se borra nada.")
      (when (yes-or-no-p
             (format "¿Borrar %d adjunto(s) y sus enlaces?%s %s "
                     (length to-delete)
                     (if kept (format " (se conservan %d enlazados en tareas abiertas o notas)"
                                      (length kept))
                       "")
                     (organice--trash-note)))
        (let ((done-paths nil))
          (dolist (c to-delete)
            (let ((path (plist-get c :path)))
              (when (and (plist-get c :exists) (not (member path done-paths))
                         (file-exists-p path))
                (condition-case err
                    (organice--delete-file path)
                  (error (message "No se pudo borrar %s: %s" path (error-message-string err)))))
              (push path done-paths)
              (organice--review-remove-link c))))
        (organice-review-refresh)
        (when kept
          (message "Se conservan (enlazados en tareas abiertas o notas): %s"
                   (mapconcat (lambda (p) (file-relative-name p organice-directory)) kept ", ")))))))

(provide 'organice-attach)
;;; organice-attach.el ends here
