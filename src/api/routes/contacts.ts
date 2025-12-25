import express from 'express';
import { db } from '../../shared/utils';
import { authenticateToken } from '../../shared/middleware';

const router = express.Router();

router.options('/', (req: express.Request, res: express.Response) => {
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.set('Access-Control-Max-Age', '3600');
    res.status(200).send('');
});

router.get('/', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        console.log('👥 [CONTACTS API] Fetching all contacts...');
        const organizationId = req.user?.organizationId;

        if (!organizationId) {
            return res.status(403).json({
                success: false,
                error: 'User not associated with any organization'
            });
        }

        let contactsQuery: any = db.collection('contacts');
        if (organizationId) {
            contactsQuery = contactsQuery.where('organizationId', '==', organizationId);
        }

        const contactsSnapshot = await contactsQuery.get();
        const contacts = contactsSnapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data()
        }));

        console.log(`✅ [CONTACTS API] Found ${contacts.length} contacts`);
        return res.status(200).json({
            success: true,
            data: contacts,
            total: contacts.length
        });
    } catch (error: any) {
        console.error('❌ [CONTACTS API] Error fetching contacts:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch contacts',
            errorDetails: error.message || String(error)
        });
    }
});

router.get('/:id', authenticateToken, async (req: express.Request, res: express.Response) => {
    try {
        const { id } = req.params;
        const contactDoc = await db.collection('contacts').doc(id).get();

        if (!contactDoc.exists) {
            return res.status(404).json({
                success: false,
                error: 'Contact not found'
            });
        }

        const contact = {
            id: contactDoc.id,
            ...contactDoc.data()
        };

        return res.status(200).json({
            success: true,
            data: contact
        });
    } catch (error: any) {
        console.error('❌ [CONTACTS API] Error fetching contact:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch contact',
            errorDetails: error.message || String(error)
        });
    }
});

export default router;
