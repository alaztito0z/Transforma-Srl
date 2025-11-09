const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const multer = require('multer');

const app = express();
const PORT = 3002// Cambiado a 3002
const JWT_SECRET = 'tubos_secreto_universidad_2024';

// Configurar multer para uploads
const upload = multer({ dest: 'uploads/' });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Servir archivos HTML

// Base de datos en archivo JSON
const DB_FILE = 'database.json';

// Inicializar base de datos
function initDatabase() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            users: [
                {
                    id: 1,
                    username: 'admin',
                    password: bcrypt.hashSync('admin123', 10),
                    rol: 'admin',
                    fechaCreacion: new Date().toISOString()
                },
                {
                    id: 2, 
                    username: 'cliente',
                    password: bcrypt.hashSync('cliente123', 10),
                    rol: 'cliente',
                    fechaCreacion: new Date().toISOString()
                }
            ],
            tubos: [
                { id: 1, nombre: 'Tubo PVC 4"', almacen: 150, enviados: 50, fallas: 5 },
                { id: 2, nombre: 'Tubo PVC 6"', almacen: 100, enviados: 30, fallas: 2 },
                { id: 3, nombre: 'Tubo PVC 8"', almacen: 80, enviados: 20, fallas: 1 },
                { id: 4, nombre: 'Tubo Concreto 12"', almacen: 60, enviados: 15, fallas: 0 },
                { id: 5, nombre: 'Tubo Concreto 18"', almacen: 40, enviados: 10, fallas: 1 },
                { id: 6, nombre: 'Tubo Acero 3"', almacen: 200, enviados: 80, fallas: 3 },
                { id: 7, nombre: 'Tubo Acero 4"', almacen: 180, enviados: 70, fallas: 2 },
                { id: 8, nombre: 'Tubo Aluminio 2"', almacen: 120, enviados: 40, fallas: 1 },
                { id: 9, nombre: 'Tubo Aluminio 3"', almacen: 90, enviados: 25, fallas: 0 },
                { id: 10, nombre: 'Tubo Fibra 5"', almacen: 70, enviados: 18, fallas: 2 }
            ],
            historial: []
        };
        saveDatabase(initialData);
    }
}

function loadDatabase() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDatabase(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// Middleware de autenticación
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token requerido' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido' });
        }
        req.user = user;
        next();
    });
}

// ==================== RUTAS ====================

// 1. LOGIN
app.post('/api/login', (req, res) => {
    const { username, password, rol } = req.body;
    const db = loadDatabase();
    
    const user = db.users.find(u => u.username === username && u.rol === rol);
    
    if (user && bcrypt.compareSync(password, user.password)) {
        const token = jwt.sign(
            { id: user.id, username: user.username, rol: user.rol },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        // Agregar al historial
        db.historial.push({
            fecha: new Date().toISOString(),
            usuario: username,
            accion: 'login',
            descripcion: 'Inicio de sesión exitoso'
        });
        saveDatabase(db);
        
        res.json({
            success: true,
            token,
            user: { username: user.username, rol: user.rol }
        });
    } else {
        res.status(401).json({ 
            success: false, 
            error: 'Credenciales incorrectas' 
        });
    }
});

// 2. OBTENER TUBOS
app.get('/api/tubos', authenticateToken, (req, res) => {
    const db = loadDatabase();
    res.json(db.tubos);
});

// 3. ACTUALIZAR TUBO
app.put('/api/tubos/:id', authenticateToken, (req, res) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo administradores pueden editar' });
    }
    
    const db = loadDatabase();
    const tuboId = parseInt(req.params.id);
    const tuboIndex = db.tubos.findIndex(t => t.id === tuboId);
    
    if (tuboIndex === -1) {
        return res.status(404).json({ error: 'Tubo no encontrado' });
    }
    
    // Actualizar tubo
    db.tubos[tuboIndex] = { ...db.tubos[tuboIndex], ...req.body };
    
    // Registrar en historial
    db.historial.push({
        fecha: new Date().toISOString(),
        usuario: req.user.username,
        accion: 'actualizar_tubo',
        descripcion: `Actualizado: ${db.tubos[tuboIndex].nombre}`,
        datos: req.body
    });
    
    saveDatabase(db);
    res.json({ success: true, tubo: db.tubos[tuboIndex] });
});

// 4. ESTADÍSTICAS
app.get('/api/estadisticas', authenticateToken, (req, res) => {
    const db = loadDatabase();
    
    const stats = {
        totalAlmacen: db.tubos.reduce((sum, t) => sum + t.almacen, 0),
        totalEnviados: db.tubos.reduce((sum, t) => sum + t.enviados, 0),
        totalFallas: db.tubos.reduce((sum, t) => sum + t.fallas, 0),
        totalTipos: db.tubos.length
    };
    stats.totalDisponible = stats.totalAlmacen - stats.totalFallas;
    
    res.json(stats);
});

// 5. CAMBIAR CONTRASEÑA
app.post('/api/cambiar-password', authenticateToken, (req, res) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo administradores pueden cambiar contraseñas' });
    }
    
    const { usuario, nuevaPassword } = req.body;
    const db = loadDatabase();
    
    const userIndex = db.users.findIndex(u => u.username === usuario);
    if (userIndex === -1) {
        return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    
    db.users[userIndex].password = bcrypt.hashSync(nuevaPassword, 10);
    
    // Registrar en historial
    db.historial.push({
        fecha: new Date().toISOString(),
        usuario: req.user.username,
        accion: 'cambiar_password',
        descripcion: `Contraseña cambiada para: ${usuario}`
    });
    
    saveDatabase(db);
    res.json({ success: true, message: 'Contraseña actualizada' });
});

// 6. OBTENER HISTORIAL
app.get('/api/historial', authenticateToken, (req, res) => {
    const db = loadDatabase();
    res.json(db.historial.slice(-100).reverse()); // Últimos 100 registros
});

// 7. CREAR NUEVO USUARIO
app.post('/api/usuarios', authenticateToken, (req, res) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo administradores pueden crear usuarios' });
    }
    
    const { username, password, rol } = req.body;
    const db = loadDatabase();
    
    // Verificar si el usuario ya existe
    if (db.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'El usuario ya existe' });
    }
    
    const nuevoUsuario = {
        id: Math.max(...db.users.map(u => u.id)) + 1,
        username,
        password: bcrypt.hashSync(password, 10),
        rol,
        fechaCreacion: new Date().toISOString()
    };
    
    db.users.push(nuevoUsuario);
    
    // Registrar en historial
    db.historial.push({
        fecha: new Date().toISOString(),
        usuario: req.user.username,
        accion: 'crear_usuario',
        descripcion: `Nuevo usuario creado: ${username} (${rol})`
    });
    
    saveDatabase(db);
    res.json({ success: true, message: 'Usuario creado exitosamente' });
});

// 8. OBTENER USUARIOS
app.get('/api/usuarios', authenticateToken, (req, res) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo administradores pueden ver usuarios' });
    }
    
    const db = loadDatabase();
    const usuarios = db.users.map(u => ({
        id: u.id,
        username: u.username,
        rol: u.rol,
        fechaCreacion: u.fechaCreacion
    }));
    
    res.json(usuarios);
});

// 9. EXPORTAR EXCEL - CORREGIDO
app.get('/api/exportar-excel', authenticateToken, async (req, res) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo administradores pueden exportar' });
    }

    try {
        const db = loadDatabase();
        
        // Crear workbook de Excel
        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'Sistema de Gestión de Tubos';
        workbook.created = new Date();

        // Hoja 1: Inventario de Tubos
        const worksheet = workbook.addWorksheet('Inventario');
        
        // Agregar encabezados
        worksheet.columns = [
            { header: 'ID', key: 'id', width: 10 },
            { header: 'Nombre del Tubo', key: 'nombre', width: 30 },
            { header: 'En Almacén', key: 'almacen', width: 15 },
            { header: 'Enviados', key: 'enviados', width: 15 },
            { header: 'Fallas', key: 'fallas', width: 15 },
            { header: 'Disponible', key: 'disponible', width: 15 }
        ];

        // Agregar fila de encabezado
        worksheet.addRow(['ID', 'Nombre del Tubo', 'En Almacén', 'Enviados', 'Fallas', 'Disponible']);

        // Agregar datos
        db.tubos.forEach(tubo => {
            worksheet.addRow({
                id: tubo.id,
                nombre: tubo.nombre,
                almacen: tubo.almacen,
                enviados: tubo.enviados,
                fallas: tubo.fallas,
                disponible: tubo.almacen - tubo.fallas
            });
        });

        // Estilo para el encabezado
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF2C3E50' }
        };
        headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

        // Autoajustar columnas
        worksheet.columns.forEach(column => {
            column.width = column.header.length < 12 ? 12 : column.header.length;
        });

        // Configurar respuesta
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=inventario_tubos_${new Date().toISOString().split('T')[0]}.xlsx`);

        // Escribir archivo
        await workbook.xlsx.write(res);
        
        // Registrar en historial
        db.historial.push({
            fecha: new Date().toISOString(),
            usuario: req.user.username,
            accion: 'exportar_excel',
            descripcion: 'Exportación completa de datos a Excel'
        });
        saveDatabase(db);

        res.end();

    } catch (error) {
        console.error('Error exportando Excel:', error);
        res.status(500).json({ error: 'Error al exportar Excel: ' + error.message });
    }
});

// 10. IMPORTAR EXCEL
app.post('/api/importar-excel', authenticateToken, upload.single('archivo'), async (req, res) => {
    if (req.user.rol !== 'admin') {
        return res.status(403).json({ error: 'Solo administradores pueden importar' });
    }

    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se envió archivo' });
        }

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(req.file.path);
        
        const db = loadDatabase();
        const worksheet = workbook.getWorksheet('Inventario');
        let registrosProcesados = 0;

        // Empezar desde la fila 2 (saltar encabezado)
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            if (rowNumber > 1) {
                const nombre = row.getCell(2).value;
                const almacen = row.getCell(3).value;
                const enviados = row.getCell(4).value;
                const fallas = row.getCell(5).value;

                if (nombre && almacen !== undefined) {
                    const tuboExistente = db.tubos.find(t => t.nombre === nombre);
                    
                    if (tuboExistente) {
                        // Actualizar tubo existente
                        tuboExistente.almacen = almacen;
                        tuboExistente.enviados = enviados || 0;
                        tuboExistente.fallas = fallas || 0;
                    } else {
                        // Crear nuevo tubo
                        const nuevoId = Math.max(...db.tubos.map(t => t.id), 0) + 1;
                        db.tubos.push({
                            id: nuevoId,
                            nombre: nombre,
                            almacen: almacen,
                            enviados: enviados || 0,
                            fallas: fallas || 0
                        });
                    }
                    registrosProcesados++;
                }
            }
        });

        // Registrar en historial
        db.historial.push({
            fecha: new Date().toISOString(),
            usuario: req.user.username,
            accion: 'importar_excel',
            descripcion: `Importación desde Excel: ${registrosProcesados} registros procesados`
        });
        
        saveDatabase(db);

        // Limpiar archivo temporal
        fs.unlinkSync(req.file.path);

        res.json({ 
            success: true, 
            message: `Importación completada: ${registrosProcesados} registros procesados` 
        });

    } catch (error) {
        console.error('Error importando Excel:', error);
        res.status(500).json({ error: 'Error al importar Excel' });
    }
});

// 11. SERVIR ARCHIVOS HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/admin-dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});

app.get('/cliente-dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'cliente-dashboard.html'));
});

app.get('/gestion-tubos.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'gestion-tubos.html'));
});

app.get('/historial.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'historial.html'));
});

// Inicializar e iniciar servidor
initDatabase();
app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en http://localhost:${PORT}`);
    console.log(`📊 Sistema de Gestión de Tubos listo`);
    console.log(`👤 Admin: admin / admin123`);
    console.log(`👥 Cliente: cliente / cliente123`);
});