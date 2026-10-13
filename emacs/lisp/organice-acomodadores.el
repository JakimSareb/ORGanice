;;; organice-acomodadores.el --- ORGanice: turnos de acomodadores  -*- lexical-binding: t; -*-

;; (3.01) Lo mismo que la herramienta «Turnos de acomodadores» de la app, sobre el mismo fichero
;; (pages/acomodadores.org, dentro de `organice-directory'):
;; - C-c g u n  `organice-acom-nuevo-mes': tabla vacía de un mes (semanas = lunes del mes;
;;   días de reunión de #+ACOM_DIAS, por defecto jueves y sábado; #+ACOM_SEMANAS, por defecto 5)
;;   en el HISTORICO («** AAAA, Mes»).
;; - C-c g u d  `organice-acom-disponibles': quién está disponible (pide los asignados de la semana,
;;   separados por comas), por grupo, con menos turnos y la fecha más antigua primero.
;; - C-c g u s  `organice-acom-sumar': suma a los contadores (#+NAME: Publicadores, Ancianos,
;;   Ministeriales) los meses del HISTORICO aún sin :SUMADO: (desde #+ACOM_DESDE, por defecto
;;   2026-09) y los marca. «Veces» = nº de turnos: cada semana asignada cuenta 1.
;; - C-c g u o  abrir el fichero.
;; Alias: #+ACOM_ALIAS: Toni=Antonio Vilchez; Miguel Angel Lliteras=Miguel Lliteras

(require 'org)
(require 'org-table)
(require 'cl-lib)
(require 'subr-x)
(require 'ucs-normalize)

(defcustom organice-acom-file "pages/acomodadores.org"
  "Fichero de los turnos de acomodadores (relativo a `organice-directory')."
  :type 'string :group 'organice)

(defconst organice-acom--months
  '("enero" "febrero" "marzo" "abril" "mayo" "junio" "julio" "agosto" "septiembre"
    "octubre" "noviembre" "diciembre"))
(defconst organice-acom--mon3 '("Ene" "Feb" "Mar" "Abr" "May" "Jun" "Jul" "Ago" "Sep" "Oct" "Nov" "Dic"))
(defconst organice-acom--days '(("lun" . 0) ("mar" . 1) ("mie" . 2) ("jue" . 3) ("vie" . 4) ("sab" . 5) ("dom" . 6)))
(defconst organice-acom--day-labels '("Lun" "Mar" "Mie" "Jue" "Vie" "Sab" "Dom"))
(defconst organice-acom--groups '("Publicadores" "Ancianos" "Ministeriales"))

(defun organice-acom--fold (s)
  "S sin acentos, en minúsculas y sin espacios de más."
  (let ((s (downcase (string-trim (or s "")))))
    (setq s (replace-regexp-in-string "[̀-ͯ]" "" (ucs-normalize-NFD-string s)))
    (replace-regexp-in-string "[ \t]+" " " s)))

(defun organice-acom--month-index (word)
  "0…11 del mes WORD («Septiembre», «Sep», «sept»…) o nil."
  (let ((w (replace-regexp-in-string "\\." "" (organice-acom--fold word))))
    (or (cl-position w organice-acom--months :test #'string=)
        (and (>= (length w) 3)
             (cl-position (substring w 0 3) (mapcar #'organice-acom--fold organice-acom--mon3)
                          :test #'string=))
        (and (string= w "setiembre") 8))))

(defun organice-acom-open ()
  "Abre el fichero de los turnos de acomodadores."
  (interactive)
  (find-file (expand-file-name organice-acom-file organice-directory)))

(defmacro organice-acom--in-file (&rest body)
  `(with-current-buffer (find-file-noselect (expand-file-name organice-acom-file organice-directory))
     (org-with-wide-buffer ,@body)))

(defun organice-acom--keyword (name)
  (save-excursion
    (goto-char (point-min))
    (let ((case-fold-search t))
      (when (re-search-forward (format "^[ \t]*#\\+%s:[ \t]*\\(.*\\)$" name) nil t)
        (string-trim (match-string 1))))))

(defun organice-acom--config ()
  "(SEMANAS DIAS DESDE ALIAS) del fichero."
  (let* ((sem (organice-acom--keyword "ACOM_SEMANAS"))
         (dias (organice-acom--keyword "ACOM_DIAS"))
         (desde (organice-acom--keyword "ACOM_DESDE"))
         (alias nil))
    (save-excursion
      (goto-char (point-min))
      (let ((case-fold-search t))
        (while (re-search-forward "^[ \t]*#\\+ACOM_ALIAS:[ \t]*\\(.*\\)$" nil t)
          (dolist (pair (split-string (match-string 1) ";" t "[ \t]+"))
            (let ((kv (split-string pair "=" t "[ \t]+")))
              (when (= (length kv) 2)
                (push (cons (organice-acom--fold (car kv)) (cadr kv)) alias)))))))
    (list (if (and sem (> (string-to-number sem) 0)) (min 6 (string-to-number sem)) 5)
          (or (and dias (cl-remove-if-not (lambda (d) (assoc d organice-acom--days))
                                          (mapcar (lambda (x) (let ((f (organice-acom--fold x))) (substring f 0 (min 3 (length f)))))
                                                  (split-string dias "[ ,]+" t))))
              '("jue" "sab"))
          (if (and desde (string-match "\\([0-9]\\{4\\}\\)-\\([0-9]\\{1,2\\}\\)" desde))
              (+ (* 12 (string-to-number (match-string 1 desde))) (1- (string-to-number (match-string 2 desde))))
            (+ (* 12 2026) 8))
          alias)))

;;;; Contadores (#+NAME: Publicadores / Ancianos / Ministeriales)

(defun organice-acom--table-begin (name)
  "Inicio de la tabla #+NAME: NAME (o nil)."
  (save-excursion
    (goto-char (point-min))
    (let ((case-fold-search t))
      (when (re-search-forward (format "^[ \t]*#\\+NAME:[ \t]*%s[ \t]*$" (regexp-quote name)) nil t)
        (forward-line 1)
        (when (org-at-table-p) (point))))))

(defun organice-acom--people ()
  "((NOMBRE GRUPO VECES ÚLTIMA-TEXTO) …)."
  (let (out)
    (dolist (g organice-acom--groups)
      (let ((b (organice-acom--table-begin g)))
        (when b
          (save-excursion
            (goto-char b)
            (dolist (row (org-table-to-lisp))
              (when (and (listp row) (car row) (not (string-empty-p (car row)))
                         (not (string-match-p "\\`\\(nombre\\|hermano\\)" (organice-acom--fold (car row)))))
                (push (list (car row) g (string-to-number (or (nth 1 row) "0")) (or (nth 2 row) ""))
                      out)))))))
    (nreverse out)))

(defun organice-acom--resolve (name people alias)
  "Nombre de la lista para NAME (por alias o sin acentos), o nil."
  (let* ((f (organice-acom--fold name))
         (target (organice-acom--fold (or (cdr (assoc f alias)) name))))
    (car (cl-find-if (lambda (p) (string= (organice-acom--fold (car p)) target)) people))))

(defun organice-acom--last-date (txt)
  "Fecha (días) de la «última vez»: 2026-09-10, o solo el mes («Ago»: el más reciente ≤ hoy)."
  (cond
   ((string-match "\\`\\([0-9]\\{4\\}\\)-\\([0-9]\\{1,2\\}\\)-\\([0-9]\\{1,2\\}\\)" txt)
    (time-to-days (encode-time 0 0 0 (string-to-number (match-string 3 txt))
                               (string-to-number (match-string 2 txt))
                               (string-to-number (match-string 1 txt)))))
   ((organice-acom--month-index txt)
    (let* ((mi (organice-acom--month-index txt))
           (now (decode-time))
           (y (if (> (1+ mi) (nth 4 now)) (1- (nth 5 now)) (nth 5 now))))
      (time-to-days (encode-time 0 0 0 1 (1+ mi) y))))
   (t 0)))

;;;; Meses del HISTORICO

(defun organice-acom--months ()
  "((AÑO MES SUMADO MARCADOR FILAS) …); FILAS = ((SEMANA DIA A1 A2) …)."
  (let (out)
    (org-map-entries
     (lambda ()
       (let ((title (org-get-heading t t t t)))
         (when (string-match "\\`\\([0-9]\\{4\\}\\), *\\(.+\\)\\'" title)
           (let ((y (string-to-number (match-string 1 title)))
                 (m (organice-acom--month-index (match-string 2 title)))
                 (end (save-excursion (org-end-of-subtree t t)))
                 rows)
             (when m
               (save-excursion
                 (when (re-search-forward "^[ \t]*|" end t)
                   (dolist (row (org-table-to-lisp))
                     (when (and (listp row)
                                (not (string-match-p "\\`\\(semana\\|dia\\)" (organice-acom--fold (or (nth 0 row) "")))))
                       (push (list (nth 0 row) (nth 1 row) (nth 2 row) (nth 3 row)) rows)))))
               (push (list y m (org-entry-get (point) "SUMADO") (point-marker) (nreverse rows)) out))))))
     nil 'file)
    (nreverse out)))

(defun organice-acom--dia-days (dia year month)
  "Fecha (días) de «Jue-10-Sep» en el mes MONTH (0…11) de YEAR, o nil."
  (when (and dia (string-match "\\([0-9]\\{1,2\\}\\)[-/ ]\\([A-Za-zÁ-úñ]+\\)" dia))
    (let* ((d (string-to-number (match-string 1 dia)))
           (mi (organice-acom--month-index (match-string 2 dia)))
           (y (cond ((and (= month 0) (eql mi 11)) (1- year))
                    ((and (= month 11) (eql mi 0)) (1+ year))
                    (t year))))
      (when mi (time-to-days (encode-time 0 0 0 d (1+ mi) y))))))

(defun organice-acom--turns (rows year month people alias)
  "((NOMBRE TURNOS ÚLTIMA-DÍAS) …) y desconocidos, de las FILAS de un mes."
  (let ((weeks (make-hash-table :test 'equal))
        (last (make-hash-table :test 'equal))
        (unknown nil) (semana ""))
    (dolist (r rows)
      (when (and (car r) (not (string-empty-p (car r)))) (setq semana (car r)))
      (dolist (n (list (nth 2 r) (nth 3 r)))
        (when (and n (not (string-empty-p (string-trim n)))
                   (not (string-match-p "\\`\\(asamblea\\|-+\\|x+\\)\\'" (organice-acom--fold n))))
          (let ((who (organice-acom--resolve n people alias)))
            (if (not who)
                (cl-pushnew (string-trim n) unknown :test #'string=)
              (puthash who (cl-adjoin semana (gethash who weeks) :test #'string=) weeks)
              (let ((d (organice-acom--dia-days (nth 1 r) year month)))
                (when (and d (> d (or (gethash who last) 0))) (puthash who d last))))))))
    (let (out)
      (maphash (lambda (who ws) (push (list who (length ws) (gethash who last)) out)) weeks)
      (list out unknown))))

(defun organice-acom--days-text (days)
  "«2026-09-10» de una fecha en días (como `time-to-days')."
  (format-time-string "%Y-%m-%d" (org-time-from-absolute days)))

;;;; Comandos

(defun organice-acom-sumar ()
  "Suma a los contadores los meses del HISTORICO sin :SUMADO: (desde #+ACOM_DESDE)."
  (interactive)
  (organice-acom--in-file
   (let* ((cfg (organice-acom--config))
          (desde (nth 2 cfg)) (alias (nth 3 cfg))
          (people (organice-acom--people))
          (adds (make-hash-table :test 'equal))
          (lasts (make-hash-table :test 'equal))
          (summed nil) (unknown nil))
     (dolist (m (organice-acom--months))
       (when (and (not (nth 2 m)) (>= (+ (* 12 (nth 0 m)) (nth 1 m)) desde))
         (let ((r (organice-acom--turns (nth 4 m) (nth 0 m) (nth 1 m) people alias)))
           (dolist (x (car r))
             (puthash (car x) (+ (gethash (car x) adds 0) (nth 1 x)) adds)
             (when (and (nth 2 x) (> (nth 2 x) (gethash (car x) lasts 0)))
               (puthash (car x) (nth 2 x) lasts)))
           (setq unknown (append unknown (cadr r)))
           (push m summed))))
     (if (not summed)
         (message "No hay meses pendientes de sumar")
       ;; contadores
       (dolist (g organice-acom--groups)
         (let ((b (organice-acom--table-begin g)))
           (when b
             (goto-char b)
             (while (org-at-table-p)
               (unless (org-at-table-hline-p)
                 (let* ((cells (mapcar #'string-trim
                                       (split-string (string-trim (buffer-substring (line-beginning-position) (line-end-position)) "[ \t]*|" "|[ \t]*") "|")))
                        (name (car cells))
                        (add (gethash name adds 0))
                        (nl (gethash name lasts)))
                   (when (or (> add 0) nl)
                     (let* ((veces (+ (string-to-number (or (nth 1 cells) "0")) add))
                            (old (or (nth 2 cells) ""))
                            (last (if (and nl (> nl (organice-acom--last-date old)))
                                      (organice-acom--days-text nl) old)))
                       (delete-region (line-beginning-position) (line-end-position))
                       (insert (format "| %s | %d | %s |" name veces last))))))
               (forward-line 1))
             (goto-char b)
             (org-table-align))))
       ;; marcar los meses
       (dolist (m summed)
         (org-entry-put (nth 3 m) "SUMADO" (format-time-string "%Y-%m-%d")))
       (save-buffer)
       (message "Sumados: %s%s"
                (mapconcat (lambda (m) (format "%d, %s" (nth 0 m) (capitalize (nth (nth 1 m) organice-acom--months))))
                           (reverse summed) " · ")
                (if unknown (format " · no están en la lista: %s" (string-join (delete-dups unknown) ", ")) ""))))))

(defun organice-acom--weeks (year month semanas dias)
  "((SEMANA (DIA…)) …) de MONTH (0…11): los lunes del mes."
  (let* ((d (encode-time 0 0 12 1 (1+ month) year)) ; a mediodía: sin líos con el cambio de hora
         out)
    (while (/= (nth 6 (decode-time d)) 1)
      (setq d (time-add d (days-to-time 1))))
    (while (and (= (nth 4 (decode-time d)) (1+ month)) (< (length out) semanas))
      (let* ((dt (decode-time d))
             (sem (format "%d-%s" (nth 3 dt) (nth (1- (nth 4 dt)) organice-acom--mon3)))
             (days (mapcar (lambda (id)
                             (let* ((off (cdr (assoc id organice-acom--days)))
                                    (x (decode-time (time-add d (days-to-time off)))))
                               (format "%s-%d-%s" (nth off organice-acom--day-labels) (nth 3 x)
                                       (nth (1- (nth 4 x)) organice-acom--mon3))))
                           (sort (copy-sequence dias)
                                 (lambda (a b) (< (cdr (assoc a organice-acom--days)) (cdr (assoc b organice-acom--days))))))))
        (push (list sem days) out))
      (setq d (time-add d (days-to-time 7))))
    (nreverse out)))

(defun organice-acom-nuevo-mes (year month)
  "Crea en el HISTORICO la tabla vacía del mes MONTH (1…12) de YEAR."
  (interactive
   (let* ((now (decode-time))
          (y (read-number "Año: " (if (= (nth 4 now) 12) (1+ (nth 5 now)) (nth 5 now))))
          (m (read-number "Mes (1-12): " (1+ (mod (nth 4 now) 12)))))
     (list y m)))
  (organice-acom--in-file
   (let* ((cfg (organice-acom--config))
          (title (format "%d, %s" year (capitalize (nth (1- month) organice-acom--months)))))
     (goto-char (point-min))
     (when (re-search-forward (format "^\\*+ %s[ \t]*$" (regexp-quote title)) nil t)
       (user-error "Ya existe «%s»" title))
     (goto-char (point-min))
     (if (re-search-forward "^\\* HIST[OÓ]RICO" nil t)
         (org-end-of-subtree t t)
       (goto-char (point-max))
       (unless (bolp) (insert "\n"))
       (insert "* HISTORICO\n"))
     (unless (bolp) (insert "\n"))
     (insert (format "** %s\n| Semana | Dia | Acomodador 1 | Acomodador 2 |\n|-\n" title))
     (dolist (w (organice-acom--weeks year (1- month) (nth 0 cfg) (nth 1 cfg)))
       (dolist (dia (cadr w))
         (insert (format "| %s | %s | | |\n" (car w) dia))))
     (forward-line -1)
     (org-table-align)
     (save-buffer)
     (message "Creado «%s»" title)))
  (organice-acom-open))

(defun organice-acom-disponibles (asignados)
  "Disponibles por grupo (sin ASIGNADOS, separados por comas), con menos turnos y fecha más
antigua primero (contando los meses aún sin sumar)."
  (interactive (list (read-string "Asignados de la semana (separados por comas): ")))
  (let (lines)
    (organice-acom--in-file
     (let* ((cfg (organice-acom--config))
            (alias (nth 3 cfg)) (desde (nth 2 cfg))
            (people (organice-acom--people))
            (veces (make-hash-table :test 'equal))
            (lasts (make-hash-table :test 'equal))
            (ex (delq nil (mapcar (lambda (n) (organice-acom--resolve n people alias))
                                  (split-string asignados "[,\n]+" t "[ \t]+"))))
            (unknown (cl-remove-if (lambda (n) (organice-acom--resolve n people alias))
                                   (split-string asignados "[,\n]+" t "[ \t]+"))))
       (dolist (p people)
         (puthash (car p) (nth 2 p) veces)
         (puthash (car p) (organice-acom--last-date (nth 3 p)) lasts))
       (dolist (m (organice-acom--months))
         (when (and (not (nth 2 m)) (>= (+ (* 12 (nth 0 m)) (nth 1 m)) desde))
           (dolist (x (car (organice-acom--turns (nth 4 m) (nth 0 m) (nth 1 m) people alias)))
             (puthash (car x) (+ (gethash (car x) veces 0) (nth 1 x)) veces)
             (when (and (nth 2 x) (> (nth 2 x) (gethash (car x) lasts 0))) (puthash (car x) (nth 2 x) lasts)))))
       (dolist (g organice-acom--groups)
         (let ((list (cl-remove-if-not (lambda (p) (and (equal (nth 1 p) g) (not (member (car p) ex)))) people)))
           (when list
             (push (format "* %s" g) lines)
             (dolist (p (sort list (lambda (a b)
                                     (let ((va (gethash (car a) veces)) (vb (gethash (car b) veces)))
                                       (if (/= va vb) (< va vb)
                                         (< (gethash (car a) lasts 0) (gethash (car b) lasts 0)))))))
               (let ((l (gethash (car p) lasts 0)))
                 (push (format "  %-28s %3d  %s" (car p) (gethash (car p) veces)
                               (if (> l 0) (organice-acom--days-text l) "—"))
                       lines))))))
       (when unknown (push (format "\nNo están en la lista: %s" (string-join unknown ", ")) lines))))
    (with-current-buffer (get-buffer-create "*Acomodadores disponibles*")
      (let ((inhibit-read-only t))
        (erase-buffer)
        (insert "Disponibles (veces · última)\n\n" (string-join (nreverse lines) "\n") "\n")
        (goto-char (point-min))
        (special-mode))
      (display-buffer (current-buffer)))))

(defvar organice-acom-map
  (let ((m (make-sparse-keymap)))
    (define-key m "o" #'organice-acom-open)
    (define-key m "n" #'organice-acom-nuevo-mes)
    (define-key m "d" #'organice-acom-disponibles)
    (define-key m "s" #'organice-acom-sumar)
    m)
  "Turnos de acomodadores (C-c g u …).")

(provide 'organice-acomodadores)
;;; organice-acomodadores.el ends here
